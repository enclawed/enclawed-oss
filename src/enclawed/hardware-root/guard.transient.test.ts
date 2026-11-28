// A late or missing answer is not a lost device (release blocker, 2.0.3): a genuine, present
// Enclaweder latched DIRTY twice on a loaded host (a large model on the GPU, WSL2 with usbipd),
// each time costing a one-time recovery code. These tests drive the guard and the HID driver
// against a simulated device (software key, in-memory transport; never /dev/hidraw):
//   * an answer already waiting when a stalled process wakes past its deadline is read;
//   * no answer is asked again within a fixed window, and latches DIRTY only past it;
//   * a node that went away (ENODEV) is reopened, accepting only the same device;
//   * a definite wrong answer (bad signature) latches DIRTY at once;
//   * a wall-clock step changes nothing (the timing is monotonic).
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { DeviceTransientError, Enclaweder } from "./enclaweder-hid.js";
import { HardwareRootGuard, type GuardDevice } from "./guard.js";
import type { HidTransport } from "./hid-transport.js";

const base = fs.mkdtempSync(path.join(os.tmpdir(), "hw-guard-transient-"));
process.env.ENCLAWEDER_FORENSIC_LOG = path.join(base, "forensics.jsonl");
afterAll(() => fs.rmSync(base, { recursive: true, force: true }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// The real monotonic clock, for the busy waits that stand in for a stalled host: bound before
// any test fakes `performance`, so a stall can never spin on a frozen fake clock.
const realNow = performance.now.bind(performance);

const OP = { GET_STATUS: 0x02, GET_IDENTITY: 0x0d, LATCH_GET: 0x1c } as const;
const TAG_GET = Buffer.from("ECW-LATCH-GET-01", "latin1");

function crc16(b: Buffer): number {
  let c = 0xffff;
  for (const x of b) {
    c ^= x << 8;
    for (let i = 0; i < 8; i++) {
      c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
    }
  }
  return c;
}
function frame(type: number, id: number, payload: Buffer): Buffer {
  const body = Buffer.concat([
    Buffer.from([1, type, id & 0xff, id >> 8, payload.length & 0xff, payload.length >> 8]),
    payload,
  ]);
  const c = crc16(body);
  return Buffer.concat([Buffer.from([0xe2]), body, Buffer.from([c & 0xff, c >> 8])]);
}

/** A simulated Enclaweder: answers identity, status and a signed LATCH_GET. */
class SimDevice {
  readonly key: crypto.KeyObject;
  readonly pub: Buffer;
  readonly uid = crypto.randomBytes(12);
  latchSet = false;
  /** Sign LATCH_GET with this key instead (a forged answer). */
  signWith: crypto.KeyObject | null = null;
  constructor() {
    const k = crypto.generateKeyPairSync("ed25519");
    this.key = k.privateKey;
    this.pub = Buffer.from((k.publicKey.export({ format: "jwk" }) as { x: string }).x, "base64url");
  }
  answer(type: number, payload: Buffer): Buffer {
    if (type === OP.GET_IDENTITY) {
      return Buffer.concat([Buffer.from([0]), this.uid, this.pub, Buffer.from([0])]);
    }
    if (type === OP.GET_STATUS) {
      const p = Buffer.alloc(17);
      p[1] = 3; // READY
      return p;
    }
    if (type === OP.LATCH_GET) {
      const b = Buffer.alloc(64);
      b[0] = 1;
      b[1] = this.latchSet ? 1 : 0;
      b[2] = this.latchSet ? 7 : 0;
      b[4] = 0x18; // armed, session live
      this.uid.copy(b, 52);
      const sig = crypto.sign(
        null,
        Buffer.concat([TAG_GET, payload, b]),
        this.signWith ?? this.key,
      );
      return Buffer.concat([Buffer.from([0]), b, sig]);
    }
    return Buffer.from([8]);
  }
}

type Behavior = {
  /** Requests to swallow without answering. */
  drop?: number;
  /** Throw this errno on the next read (the node went away). */
  goneOnRead?: string;
};

/** An in-memory node for `dev`. `log` counts requests by opcode. */
function transport(dev: SimDevice, b: Behavior = {}, log: number[] = []): HidTransport {
  const q: Buffer[] = [];
  return {
    writeReport(rep) {
      const f = rep.subarray(1);
      const type = f[2];
      const id = f.readUInt16LE(3);
      const len = f.readUInt16LE(5);
      log.push(type);
      if (b.drop && b.drop > 0) {
        b.drop--;
        return;
      }
      const out = frame(type | 0x80, id, dev.answer(type, Buffer.from(f.subarray(7, 7 + len))));
      for (let o = 0; o < out.length; o += 64) {
        q.push(out.subarray(o, o + 64));
      }
    },
    readReport(into) {
      if (b.goneOnRead) {
        const e = new Error("gone") as NodeJS.ErrnoException;
        e.code = b.goneOnRead;
        throw e;
      }
      const r = q.shift();
      if (!r) {
        return 0;
      }
      r.copy(into);
      return r.length;
    },
    close() {},
  };
}

let n = 0;
/** A guard whose host cache says it is bound CLEAN to `dev` (no device session: no LATCH_OPEN). */
function boundGuard(dev: SimDevice): HardwareRootGuard {
  const p = path.join(base, `g${++n}.state`);
  fs.writeFileSync(
    p,
    JSON.stringify({
      status: "CLEAN",
      bound: {
        serial: "ENCLW-" + dev.uid.toString("hex").toUpperCase(),
        pubkey: dev.pub.toString("hex"),
        uid: dev.uid.toString("hex"),
      },
    }),
  );
  return new HardwareRootGuard({ statePath: p });
}

/** A GuardDevice over `dev` whose identity request fails `misses` times with no answer. */
function flaky(dev: SimDevice, misses: number, slowMs = 0): GuardDevice & { calls: number } {
  const g = {
    calls: 0,
    async getIdentity() {
      g.calls++;
      if (g.calls <= misses) {
        if (slowMs) {
          await new Promise((r) => setTimeout(r, slowMs));
        }
        throw new DeviceTransientError(
          "no-answer",
          "the device did not answer the identity request",
        );
      }
      return { uid: dev.uid, serial: "x", pubkeyRaw: dev.pub, flags: 0 };
    },
    async getStatus() {
      return { state: 3, gate: 0, k: 0, n: 0, nodesOnline: 0, ledger: 0, locked: 0 };
    },
    async challenge(): Promise<never> {
      throw new Error("unused");
    },
    async getCert() {
      return null;
    },
    async request(type: number, _id: number, payload = Buffer.alloc(0)) {
      return { payload: dev.answer(type, payload) };
    },
  };
  return g;
}

const fakeTime = () =>
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance", "Date"],
  });

describe("an answer already waiting is read, however late this process wakes", () => {
  it("the driver reads the answer that arrived while the event loop was stalled past the deadline", async () => {
    const dev = new SimDevice();
    const t = transport(dev);
    // The answer is queued at once, but this process does not look at it until long after the
    // 50 ms deadline: the first read finds nothing yet, then the event loop is blocked 150 ms.
    let first = false;
    const read = t.readReport.bind(t);
    const write = t.writeReport.bind(t);
    t.writeReport = (rep) => {
      write(rep);
      first = true; // the stall begins at the first look after the request is on the wire
    };
    t.readReport = (into) => {
      if (first) {
        first = false;
        setTimeout(() => {
          const until = realNow() + 150;
          while (realNow() < until) {
            /* a stalled host */
          }
        }, 0);
        return 0;
      }
      return read(into);
    };
    const enc = new Enclaweder("/sim", t);
    const f = await enc.request(OP.GET_IDENTITY, 1, Buffer.alloc(0), 50);
    expect(f?.payload.subarray(13, 45).equals(dev.pub)).toBe(true);
  });

  it("a heartbeat check whose answers wait out a stalled event loop does not latch DIRTY", async () => {
    const dev = new SimDevice();
    const t = transport(dev);
    let armed = false;
    let stalled = false;
    const read = t.readReport.bind(t);
    const write = t.writeReport.bind(t);
    t.writeReport = (rep) => {
      write(rep);
      armed = true;
    };
    t.readReport = (into) => {
      if (armed && !stalled) {
        stalled = true;
        setTimeout(() => {
          const until = realNow() + 3_200; // past the 3000 ms identity timeout
          while (realNow() < until) {
            /* a 32B model on the GPU */
          }
        }, 0);
        return 0;
      }
      return read(into);
    };
    const guard = boundGuard(dev);
    const r = await guard.check(new Enclaweder("/sim", t));
    expect(r).toEqual({ ok: true });
    expect(guard.status).toBe("CLEAN");
  }, 15_000);
});

describe("no answer is asked again within a fixed window", () => {
  it("two misses in a row, then an answer: CLEAN, nothing latched", async () => {
    fakeTime();
    const dev = new SimDevice();
    const guard = boundGuard(dev);
    const d = flaky(dev, 2);
    const p = guard.check(d);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await p).toEqual({ ok: true });
    expect(d.calls).toBe(3);
    expect(guard.status).toBe("CLEAN");
  });

  it("misses on every attempt: DIRTY once the attempts are spent", async () => {
    fakeTime();
    const dev = new SimDevice();
    const guard = boundGuard(dev);
    const d = flaky(dev, Infinity);
    const p = guard.check(d);
    await vi.advanceTimersByTimeAsync(15_000);
    const r = await p;
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no response.*asked again; no answer within/);
    expect(r.reason).not.toMatch(/attempt/);
    expect(guard.status).toBe("DIRTY");
  });

  it("slow misses past the window: DIRTY when the window runs out, before the attempts do", async () => {
    fakeTime();
    const dev = new SimDevice();
    const guard = boundGuard(dev);
    const d = flaky(dev, Infinity, 6_000);
    const p = guard.check(d);
    await vi.advanceTimersByTimeAsync(20_000);
    const r = await p;
    expect(r.ok).toBe(false);
    expect(d.calls).toBe(2);
    expect(guard.status).toBe("DIRTY");
  });

  it("while a check is retrying the gate is 'checking', not DIRTY; it opens again on the answer", async () => {
    fakeTime();
    const dev = new SimDevice();
    const guard = boundGuard(dev);
    // A session stands in for the device host session: it makes freshness count.
    (guard as unknown as { session: object }).session = {};
    const d = flaky(dev, 2);
    guard.startHeartbeat(d, { intervalMs: 1_000 });
    await vi.advanceTimersByTimeAsync(1_000 + 1_600);
    expect(guard.gate().kind).toBe("checking");
    expect(guard.status).toBe("CLEAN");
    await vi.advanceTimersByTimeAsync(3_000);
    expect(guard.gate()).toEqual({ kind: "clean" });
    guard.stopHeartbeat();
  });

  it("the driver over the simulator: dropped requests then answers leave the guard CLEAN", async () => {
    fakeTime();
    const dev = new SimDevice();
    const guard = boundGuard(dev);
    const log: number[] = [];
    const enc = new Enclaweder("/sim", transport(dev, { drop: 2 }, log));
    const p = guard.check(enc);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(await p).toEqual({ ok: true });
    expect(log.filter((x) => x === OP.GET_IDENTITY).length).toBe(3);
    expect(guard.status).toBe("CLEAN");
  });
});

describe("a node that went away is reopened, accepting only the same device", () => {
  /** A driver over `dev` whose node goes away after its first identity answer. */
  async function goneAfterIdentity(dev: SimDevice, reopenTo: () => HidTransport) {
    const b: Behavior = {};
    const enc = new Enclaweder("/sim/0", transport(dev, b), {
      scan: () => ["/sim/1"],
      open: (p) => {
        if (p === "/sim/0") {
          const e = new Error("no such node") as NodeJS.ErrnoException;
          e.code = "ENOENT";
          throw e;
        }
        return reopenTo();
      },
    });
    await enc.getIdentity(); // pins this device's key and uid
    b.goneOnRead = "ENODEV";
    return enc;
  }

  it("ENODEV, then the same device on a new node: recovered, nothing latched", async () => {
    const dev = new SimDevice();
    const guard = boundGuard(dev);
    const enc = await goneAfterIdentity(dev, () => transport(dev));
    expect(await guard.check(enc)).toEqual({ ok: true });
    expect(guard.status).toBe("CLEAN");
  });

  it("ENODEV, then a DIFFERENT device on the node: DIRTY", async () => {
    const dev = new SimDevice();
    const other = new SimDevice();
    const guard = boundGuard(dev);
    const enc = await goneAfterIdentity(dev, () => transport(other));
    const r = await guard.check(enc);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/different device/);
    expect(guard.status).toBe("DIRTY");
  });

  it("ENODEV, and no device comes back within the window: DIRTY", async () => {
    fakeTime();
    const dev = new SimDevice();
    const guard = boundGuard(dev);
    const enc = await goneAfterIdentity(dev, () => {
      const e = new Error("no such node") as NodeJS.ErrnoException;
      e.code = "ENOENT";
      throw e;
    });
    const p = guard.check(enc);
    await vi.advanceTimersByTimeAsync(12_000);
    const r = await p;
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not found again/);
    expect(guard.status).toBe("DIRTY");
  });
});

describe("a definite answer latches at once", () => {
  it("a latch read that does not verify under the bound key: DIRTY on the first attempt", async () => {
    const dev = new SimDevice();
    dev.signWith = crypto.generateKeyPairSync("ed25519").privateKey;
    const guard = boundGuard(dev);
    const log: number[] = [];
    const r = await guard.check(new Enclaweder("/sim", transport(dev, {}, log)));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/did not verify/);
    expect(log.filter((x) => x === OP.LATCH_GET).length).toBe(1);
    expect(guard.status).toBe("DIRTY");
  });

  it("a device that reports its own latch set: DIRTY at once", async () => {
    const dev = new SimDevice();
    dev.latchSet = true;
    const guard = boundGuard(dev);
    const r = await guard.check(new Enclaweder("/sim", transport(dev)));
    expect(r.ok).toBe(false);
    expect(guard.status).toBe("DIRTY");
  });
});

describe("the heartbeat's timing is monotonic", () => {
  it("wall-clock steps of +/-16.6 s during the heartbeat change nothing", async () => {
    const dev = new SimDevice();
    const guard = boundGuard(dev);
    (guard as unknown as { session: object }).session = {};
    const real = Date.now.bind(Date);
    let step = 0;
    vi.spyOn(Date, "now").mockImplementation(() => real() + (step++ % 2 ? 16_600 : -16_600));
    guard.startHeartbeat(new Enclaweder("/sim", transport(dev)), { intervalMs: 20 });
    await new Promise((r) => setTimeout(r, 300));
    expect(guard.gate()).toEqual({ kind: "clean" });
    guard.stopHeartbeat();
    expect(step).toBeGreaterThan(0); // the clock was read, and stepped, while beating
    expect(guard.status).toBe("CLEAN");
  });
});
