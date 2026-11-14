// A tamper latch belongs to the host, not to the number of devices that wrote
// it. One device keeps its latch at the guard's state path, several keep one
// each beside it, and earlier versions named those by enumeration order. These
// boot the real bootstrap with the bus mocked: whatever devices are present, a
// latch any device left DIRTY refuses the boot before a device is opened, and
// recovery clears a latch with the device it names, wherever it enumerates.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hostLatches, memberLatchName } from "./latches.js";

const CHALLENGE_TAG = Buffer.from("ECW-CHALLENGE-01");

const bus = vi.hoisted(() => ({
  paths: [] as string[],
  devices: {} as Record<string, unknown>,
  opened: [] as string[],
}));

vi.mock("./enclaweder-hid.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("./enclaweder-hid.js")>();
  return {
    ...real,
    findAllEnclaweders: () => bus.paths,
    // Called with `new`; returning an object makes it the instance.
    Enclaweder: vi.fn(function open(p: string) {
      bus.opened.push(p);
      const d = bus.devices[p];
      if (!d) {
        throw new Error(`no device at ${p}`);
      }
      return d;
    }),
  };
});

function device() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const raw = Buffer.from((publicKey.export({ format: "jwk" }) as { x: string }).x, "base64url");
  const uid = crypto.randomBytes(12);
  const serial = `ENCLW-${uid.toString("hex").toUpperCase()}`;
  return {
    uid: uid.toString("hex"),
    pubkey: raw.toString("hex"),
    serial,
    dev: {
      getIdentity: async () => ({ uid, serial, pubkeyRaw: raw, flags: 0x0f }),
      challenge: async (nonce: Buffer) => ({
        uid,
        sig: crypto.sign(null, Buffer.concat([CHALLENGE_TAG, nonce, uid]), privateKey),
      }),
      close() {},
    },
  };
}
type Dev = ReturnType<typeof device>;

const root = fs.mkdtempSync(path.join(os.tmpdir(), "hw-latch-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

let dir = "";
let legacy = "";
const env = [
  "ENCLAWEDER_STATE",
  "ENCLAWEDER_STATE_DIR",
  "ENCLAWEDER_BROKER",
  "ENCLAWEDER_ROOT",
  "ENCLAWEDER_HIDRAW",
];
const saved = Object.fromEntries(env.map((k) => [k, process.env[k]]));
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(root, "s-"));
  legacy = fs.mkdtempSync(path.join(root, "l-"));
  process.env.ENCLAWEDER_STATE = path.join(dir, "hw.state");
  process.env.ENCLAWEDER_STATE_DIR = legacy;
  process.env.ENCLAWEDER_BROKER = "off";
  delete process.env.ENCLAWEDER_ROOT;
  delete process.env.ENCLAWEDER_HIDRAW;
  bus.paths = [];
  bus.devices = {};
  bus.opened = [];
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  for (const k of env) {
    if (saved[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = saved[k];
    }
  }
  vi.restoreAllMocks();
});

/** A latch as the guard writes it, for the device `d`. */
function latch(file: string, d: Dev, status: "CLEAN" | "DIRTY", sessionOpen = false): string {
  fs.writeFileSync(
    file,
    JSON.stringify({
      status,
      bound: { serial: d.serial, pubkey: d.pubkey, uid: d.uid },
      dirty: status === "DIRTY" ? { reason: "unplugged mid-session", at: 1 } : null,
      sessionOpen,
    }),
  );
  return file;
}
const memberFile = (d: Dev) => path.join(dir, memberLatchName(d.uid));

/** The bootstrap, fresh: its bindings are per process. */
async function boot() {
  vi.resetModules();
  const m = await import("./index.js");
  return m.bootHardwareRoot();
}
function plug(...ds: Dev[]) {
  bus.paths = ds.map((_, i) => `/dev/hidraw${i}`);
  ds.forEach((d, i) => (bus.devices[`/dev/hidraw${i}`] = d.dev));
}

describe("every latch on the host", () => {
  it("reads the single-device latch, each device's own, and the order-named ones of earlier versions", () => {
    const a = device();
    const b = device();
    latch(process.env.ENCLAWEDER_STATE!, a, "CLEAN");
    latch(memberFile(b), b, "DIRTY");
    latch(path.join(legacy, ".enclawed-hw-root.1.state"), a, "DIRTY");
    // Not latches: the journal beside the state, and names no version wrote.
    fs.writeFileSync(path.join(dir, "hw.state.queue.jsonl"), "{}");
    fs.writeFileSync(path.join(dir, ".enclawed-hw-root.zz.state"), "{}");
    fs.writeFileSync(path.join(legacy, memberLatchName(a.uid)), "{}");
    const found = hostLatches(process.env.ENCLAWEDER_STATE!, legacy).map((l) => l.path);
    expect(found.toSorted()).toEqual(
      [
        process.env.ENCLAWEDER_STATE!,
        memberFile(b),
        path.join(legacy, ".enclawed-hw-root.1.state"),
      ].toSorted(),
    );
  });
});

describe("a boot refuses while any device's latch is DIRTY", () => {
  it("with no device present, a latch one of several devices left", async () => {
    const a = device();
    latch(memberFile(a), a, "DIRTY");
    await expect(boot()).rejects.toThrow(new RegExp(`latched DIRTY .* ${a.serial}`));
  });

  it("with no device present, a latch an earlier version named by order", async () => {
    const a = device();
    latch(path.join(legacy, ".enclawed-hw-root.0.state"), a, "DIRTY");
    await expect(boot()).rejects.toThrow(/latched DIRTY/);
  });

  it("with one device present, the latch the other of two left, before opening any", async () => {
    const a = device();
    const b = device();
    latch(memberFile(b), b, "DIRTY");
    plug(a);
    await expect(boot()).rejects.toThrow(new RegExp(`latched DIRTY .* ${b.serial}`));
    expect(bus.opened).toEqual([]);
  });

  it("with two devices present, the latch one device left when it was alone", async () => {
    const a = device();
    const b = device();
    latch(process.env.ENCLAWEDER_STATE!, a, "DIRTY");
    plug(a, b);
    await expect(boot()).rejects.toThrow(new RegExp(`latched DIRTY .* ${a.serial}`));
    expect(bus.opened).toEqual([]);
  });

  it("with no device present, a session one of several devices left open", async () => {
    const a = device();
    latch(memberFile(a), a, "CLEAN", true);
    await expect(boot()).rejects.toThrow(
      new RegExp(`continue a session accredited by .*${a.serial}`),
    );
    process.env.ENCLAWEDER_ROOT = "optional";
    await expect(boot()).resolves.toBeNull();
  });

  it("and runs software-only when every latch is CLEAN and closed", async () => {
    const a = device();
    latch(memberFile(a), a, "CLEAN");
    latch(process.env.ENCLAWEDER_STATE!, a, "CLEAN");
    await expect(boot()).resolves.toBeNull();
  });
});

describe("recovery", () => {
  async function recover(statePath: string) {
    vi.resetModules();
    const m = await import("./index.js");
    return m.recoverHardwareRootStandalone({ humanConfirmed: true, statePath });
  }

  it("clears a latch with the device it names, wherever that device enumerates", async () => {
    const a = device();
    const b = device();
    const f = latch(memberFile(b), b, "DIRTY");
    plug(a, b); // b is second on the bus
    await expect(recover(f)).resolves.toEqual({ recovered: true, serial: b.serial });
    expect(JSON.parse(fs.readFileSync(f, "utf8")).status).toBe("CLEAN");
  });

  it("refuses when the device the latch names is not present", async () => {
    const a = device();
    const b = device();
    const f = latch(memberFile(b), b, "DIRTY");
    plug(a);
    await expect(recover(f)).rejects.toThrow(/NOT the bound root/);
    expect(JSON.parse(fs.readFileSync(f, "utf8")).status).toBe("DIRTY");
  });
});
