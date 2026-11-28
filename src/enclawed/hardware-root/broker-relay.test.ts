// Host-only checks of the broker's relay ops: their bounds, the per-client rate limit, and an
// owner answering them on a real socket (with a stub service: no device involved).
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  checkRelayRequest,
  claimOwnership,
  RELAY_LIMITS,
  RelayRateLimit,
  type RootService,
  schedulerFor,
  serveRoot,
} from "./broker.js";

const dir = mkdtempSync(path.join(os.tmpdir(), "hw-relay-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("relay bounds", () => {
  it("accepts only bounded sizes and the two sealed-factor frame types", () => {
    expect(checkRelayRequest({ op: "entropy", n: 0 }).ok).toBe(false);
    expect(checkRelayRequest({ op: "entropy", n: RELAY_LIMITS.entropyMaxBytes + 1 }).ok).toBe(
      false,
    );
    expect(checkRelayRequest({ op: "entropy", n: 2.5 }).ok).toBe(false);
    expect(checkRelayRequest({ op: "entropy", n: "8" }).ok).toBe(false);
    expect(checkRelayRequest({ op: "entropy", n: RELAY_LIMITS.entropyMaxBytes })).toMatchObject({
      ok: true,
    });
    expect(checkRelayRequest({ op: "sealed", type: 0x11, frame: "00".repeat(48) }).ok).toBe(false);
    expect(checkRelayRequest({ op: "sealed", type: 0x35, frame: "00".repeat(47) }).ok).toBe(false);
    expect(checkRelayRequest({ op: "sealed", type: 0x35, frame: "00".repeat(48) }).ok).toBe(true);
    expect(
      checkRelayRequest({
        op: "sealed",
        type: 0x36,
        frame: "00".repeat(RELAY_LIMITS.sealedMinLen - 1),
      }).ok,
    ).toBe(false);
    expect(
      checkRelayRequest({ op: "sealed", type: 0x36, frame: "00".repeat(RELAY_LIMITS.sealedMaxLen) })
        .ok,
    ).toBe(true);
    expect(
      checkRelayRequest({
        op: "sealed",
        type: 0x36,
        frame: "00".repeat(RELAY_LIMITS.sealedMaxLen + 1),
      }).ok,
    ).toBe(false);
    expect(checkRelayRequest({ op: "sealed", type: 0x36, frame: "0g".repeat(43) }).ok).toBe(false);
    expect(checkRelayRequest({ op: "sealed", type: 0x36, frame: 5 }).ok).toBe(false);
    // An unlock use is UNLOCK_USE's exact 80-byte request, nothing else.
    const use = "00".repeat(RELAY_LIMITS.unlockUseLen);
    expect(checkRelayRequest({ op: "unlock-use", frame: use })).toMatchObject({ ok: true });
    expect(checkRelayRequest({ op: "unlock-use", frame: use.slice(2) }).ok).toBe(false);
    expect(checkRelayRequest({ op: "unlock-use", frame: `${use}00` }).ok).toBe(false);
    expect(checkRelayRequest({ op: "unlock-use", frame: `${use.slice(2)}zz` }).ok).toBe(false);
    expect(checkRelayRequest({ op: "unlock-use", frame: 80 }).ok).toBe(false);
    // Anchor frames: open, set, keepalive, close at their exact lengths, get empty.
    for (const [type, len] of [
      [0x19, 48],
      [0x17, 80],
      [0x1b, 48],
      [0x1a, 48],
      [0x18, 0],
    ] as const) {
      expect(checkRelayRequest({ op: "anchor", type, frame: "00".repeat(len) })).toMatchObject({
        ok: true,
        anchorType: type,
      });
      expect(checkRelayRequest({ op: "anchor", type, frame: "00".repeat(len + 1) }).ok).toBe(false);
    }
    expect(checkRelayRequest({ op: "anchor", type: 0x16, frame: "" }).ok).toBe(false);
    expect(checkRelayRequest({ op: "anchor", type: "25", frame: "00".repeat(48) }).ok).toBe(false);
    expect(checkRelayRequest({ op: "anchor", type: 0x19, frame: "zz".repeat(48) }).ok).toBe(false);
  });

  it("rate-limits per one-second window", () => {
    let t = 0;
    const rl = new RelayRateLimit(3, () => t);
    expect([rl.take(), rl.take(), rl.take(), rl.take()]).toEqual([true, true, true, false]);
    t = 999;
    expect(rl.take()).toBe(false);
    t = 1000;
    expect(rl.take()).toBe(true);
  });
});

describe("an owner serving the relay ops", () => {
  it("relays within bounds, refuses outside them, rate-limits, and says when an op is not offered", async () => {
    const relayed: Buffer[] = [];
    const svc: RootService = {
      members: () => [],
      run: async () => {
        throw new Error("unused");
      },
      health: () => ({ status: "CLEAN" }),
      entropy: async (n) => Buffer.alloc(n, 0xab),
      relaySealed: async (_type, payload) => {
        relayed.push(Buffer.from(payload));
        return Buffer.from([0, 1, 2]);
      },
      relayUnlockUse: async (payload) => {
        relayed.push(Buffer.from(payload));
        return Buffer.from([0, 9]);
      },
      relayAnchor: async (type, payload) => {
        relayed.push(Buffer.from([type, ...payload]));
        return Buffer.from([0, type]);
      },
    };
    const p = path.join(dir, "o.sock");
    const served = serveRoot(
      (await claimOwnership(p))!,
      Promise.resolve({ svc, scheduler: schedulerFor(svc) }),
    );
    const sock = net.connect(p);
    await new Promise((r) => sock.once("connect", r));
    let buf = "";
    const answers = new Map<number, Record<string, unknown>>();
    sock.on("data", (c) => {
      buf += c.toString();
      for (let nl = buf.indexOf("\n"); nl >= 0; nl = buf.indexOf("\n")) {
        const a = JSON.parse(buf.slice(0, nl)) as Record<string, unknown>;
        answers.set(a.id as number, a);
        buf = buf.slice(nl + 1);
      }
    });
    let id = 0;
    const ask = async (o: object) => {
      const me = ++id;
      sock.write(JSON.stringify({ ...o, id: me }) + "\n");
      while (!answers.has(me)) {
        await new Promise((r) => setTimeout(r, 5));
      }
      return answers.get(me)!;
    };
    try {
      expect(await ask({ op: "entropy", n: 4 })).toMatchObject({ ok: true, payload: "abababab" });
      expect(await ask({ op: "entropy", n: 100 })).toMatchObject({ ok: false });
      expect(await ask({ op: "sealed", type: 0x36, frame: "11".repeat(50) })).toMatchObject({
        ok: true,
        payload: "000102",
      });
      expect(relayed[0].equals(Buffer.alloc(50, 0x11))).toBe(true);
      expect(await ask({ op: "sealed", type: 0x0a, frame: "11".repeat(50) })).toMatchObject({
        ok: false,
      });
      expect(
        await ask({ op: "unlock-use", frame: "22".repeat(RELAY_LIMITS.unlockUseLen) }),
      ).toMatchObject({ ok: true, payload: "0009" });
      expect(relayed[1].equals(Buffer.alloc(RELAY_LIMITS.unlockUseLen, 0x22))).toBe(true);
      expect(await ask({ op: "unlock-use", frame: "22".repeat(79) })).toMatchObject({ ok: false });
      // Audit-anchor frames: each at its exact length, nothing else (no operator takeover).
      expect(await ask({ op: "anchor", type: 0x19, frame: "33".repeat(48) })).toMatchObject({
        ok: true,
        payload: "0019",
      });
      expect(relayed[2].equals(Buffer.from([0x19, ...Buffer.alloc(48, 0x33)]))).toBe(true);
      expect(await ask({ op: "anchor", type: 0x18, frame: "" })).toMatchObject({ ok: true });
      expect(await ask({ op: "anchor", type: 0x19, frame: "33".repeat(48 + 80) })).toMatchObject({
        ok: false,
      });
      expect(await ask({ op: "anchor", type: 0x2d, frame: "33".repeat(48) })).toMatchObject({
        ok: false,
      });
      const burst: Array<Record<string, unknown>> = [];
      for (let i = 0; i < RELAY_LIMITS.entropyPerSecond + 2; i++) {
        burst.push(await ask({ op: "entropy", n: 1 }));
      }
      expect(burst.filter((a) => /rate limited/.test(String(a.error))).length).toBeGreaterThan(0);
      delete svc.entropy;
      await new Promise((r) => setTimeout(r, 1100));
      expect(await ask({ op: "entropy", n: 1 })).toMatchObject({
        ok: false,
        error: expect.stringMatching(/not offered/),
      });
    } finally {
      sock.destroy();
      await served.close();
    }
  });
});
