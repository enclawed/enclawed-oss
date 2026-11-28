// The authenticated anchor relayed through an untrusted owner, at the host-protocol level. The
// stand-in below only signs, with a software key, the two structures this host verifies (the
// open transcript and the record v2, the same plain fixtures as anchor-record.test.ts); it models
// nothing else of a device. Each "owner" is a function that relays, forges, replays or redirects
// frames.
import { type KeyObject, generateKeyPairSync, randomBytes, sign as edSign } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { AnchorRelayType, RootHealth, VerifiedMember } from "./broker.js";
import { AnchorAuthError } from "./enclaweder-hid.js";
import { HeadAnchorAlarm, enclawederHeadAnchor } from "./head-anchor.js";
import { RelayedAnchorReadError, relayedAnchorDevice } from "./relayed-anchor.js";
import {
  decideSessionAnchor,
  requireSessionAnchor,
  SessionAnchorRefused,
} from "./session-anchor.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relayed-anchor-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const le64 = (v: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(v);
  return b;
};

/** Signs the open transcript and the v2 record this host verifies. Nothing more. */
class StandIn {
  readonly key: KeyObject;
  readonly raw: Buffer;
  readonly uid = randomBytes(12);
  sid = 40n;
  counter = 7n;
  opens = 40n;
  readonly opened: Buffer[] = [];
  constructor() {
    const k = generateKeyPairSync("ed25519");
    this.key = k.privateKey;
    this.raw = Buffer.from((k.publicKey.export({ format: "jwk" }) as { x: string }).x, "base64url");
  }
  answer(type: number, payload: Buffer): Buffer {
    if (type === 0x19) {
      const hostPub = payload.subarray(0, 32);
      const hostNonce = payload.subarray(32, 48);
      const eph = generateKeyPairSync("x25519");
      const devPub = Buffer.from(
        eph.publicKey.export({ format: "der", type: "spki" }).subarray(12),
      );
      const devNonce = randomBytes(16);
      this.sid += 1n;
      this.opens += 1n;
      const transcript = Buffer.concat([
        Buffer.from("ECW-ANCHOR-OPN-1", "latin1"),
        this.uid,
        le64(this.sid),
        le64(this.counter),
        hostPub,
        devPub,
        hostNonce,
        devNonce,
      ]);
      const sig = edSign(null, transcript, this.key);
      const a = Buffer.concat([
        Buffer.from([0]),
        le64(this.sid),
        le64(this.counter),
        devPub,
        devNonce,
        this.uid,
        sig,
      ]);
      this.opened.push(a);
      return a;
    }
    if (type === 0x17) {
      const head = payload.subarray(0, 32);
      const sess = payload.readBigUInt64LE(32);
      return this.record(head, sess);
    }
    if (type === 0x1b) {
      const b = Buffer.alloc(5);
      b.writeUInt32LE(120_000, 1);
      return b;
    }
    if (type === 0x1a) {
      return Buffer.from([0]);
    }
    // Command set 0.4: anything newer (ANCHOR_READ 0x38) is ERR_UNSUPPORTED.
    return Buffer.from([8]);
  }
  record(head: Buffer, sess: bigint, key: KeyObject = this.key): Buffer {
    this.counter += 1n;
    const body = Buffer.concat([le64(this.counter), head, this.uid, le64(sess), le64(this.opens)]);
    const sig = edSign(
      null,
      Buffer.concat([Buffer.from("ECW-ANCHOR-02\0\0\0", "latin1"), body]),
      key,
    );
    return Buffer.concat([Buffer.from([0, 2]), body, sig]);
  }
}

type Owner = (type: AnchorRelayType, payload: Buffer) => Promise<Buffer>;

function rootOf(dev: StandIn, owner: Owner) {
  const member = {
    uid: dev.uid.toString("hex"),
    pubkey: dev.raw.toString("hex"),
    serial: "ENCLW-TEST",
    cert: "00",
    sku: "base",
  } as unknown as VerifiedMember;
  return { members: [member], relayAnchor: owner };
}

const clean = (): RootHealth => ({ status: "CLEAN" });
const head = (n: number) => Buffer.alloc(32, n);

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    if (err instanceof AnchorAuthError) {
      return err.code;
    }
    if (err instanceof HeadAnchorAlarm) {
      return err.code;
    }
    return (err as Error).message;
  }
  return "ok";
}

describe("the anchor session relayed through the owner", () => {
  it("opens end to end against the certified key, and anchors heads under it", async () => {
    const dev = new StandIn();
    const seen: number[] = [];
    const d = relayedAnchorDevice(
      rootOf(dev, async (t, p) => {
        seen.push(t);
        return dev.answer(t, p);
      }),
      clean,
    )!;
    const s = await d.anchorOpen(dev.raw);
    expect(s.sid).toBe(41n);
    const r = await s.set(head(1));
    expect(r.sess).toBe(41n);
    expect(r.head.equals(head(1))).toBe(true);
    await s.close();
    expect(seen).toEqual([0x19, 0x17, 0x1a]);
    // The session key never crosses the wire: the owner only ever saw the client's public half.
    expect(seen.length).toBe(3);
  });

  it("an owner relaying to another device, replaying an open, or answering itself fails the signature", async () => {
    const dev = new StandIn();
    const other = new StandIn();
    const toOther = relayedAnchorDevice(
      rootOf(dev, async (t, p) => other.answer(t, p)),
      clean,
    )!;
    expect(await codeOf(toOther.anchorOpen(dev.raw))).toBe("bad-signature");

    let first: Buffer | null = null;
    const replaying = relayedAnchorDevice(
      rootOf(dev, async (t, p) => {
        if (t === 0x19 && first) {
          return first;
        }
        const a = dev.answer(t, p);
        first ??= t === 0x19 ? a : first;
        return a;
      }),
      clean,
    )!;
    await (await replaying.anchorOpen(dev.raw)).close();
    expect(await codeOf(replaying.anchorOpen(dev.raw))).toBe("bad-signature");

    const forging = relayedAnchorDevice(
      rootOf(dev, async (t, p) => {
        const a = dev.answer(t, p);
        if (t === 0x19) {
          a[a.length - 1] ^= 1;
        }
        return a;
      }),
      clean,
    )!;
    expect(await codeOf(forging.anchorOpen(dev.raw))).toBe("bad-signature");
  });

  it("a forged, foreign-session or other-head record is refused", async () => {
    const dev = new StandIn();
    const other = new StandIn();
    let mode: "sign-other" | "other-session" | "other-head" | "honest" = "honest";
    const d = relayedAnchorDevice(
      rootOf(dev, async (t, p) => {
        if (t !== 0x17 || mode === "honest") {
          return dev.answer(t, p);
        }
        const sess = p.readBigUInt64LE(32);
        if (mode === "sign-other") {
          return dev.record(p.subarray(0, 32), sess, other.key);
        }
        if (mode === "other-session") {
          return dev.record(p.subarray(0, 32), sess + 1n);
        }
        return dev.record(head(99), sess);
      }),
      clean,
    )!;
    const s = await d.anchorOpen(dev.raw);
    for (const m of ["sign-other", "other-session", "other-head"] as const) {
      mode = m;
      expect(await codeOf(s.set(head(2)))).toBe("bad-record");
    }
    mode = "honest";
    expect((await s.set(head(3))).sess).toBe(s.sid);
    await s.close();
  });

  it("opens only against the certified primary key, and only while the root is CLEAN", async () => {
    const dev = new StandIn();
    let health: RootHealth = { status: "CLEAN" };
    const d = relayedAnchorDevice(
      rootOf(dev, async (t, p) => dev.answer(t, p)),
      () => health,
    )!;
    expect(await codeOf(d.anchorOpen(new StandIn().raw))).toMatch(/certified primary member/);
    const s = await d.anchorOpen(dev.raw);
    health = { status: "DIRTY", reason: "tamper" };
    expect(await codeOf(s.set(head(4)))).toMatch(/hardware root DIRTY/);
    expect(await codeOf(d.anchorOpen(dev.raw))).toMatch(/hardware root DIRTY/);
    expect(
      relayedAnchorDevice(
        rootOf(dev, async () => Buffer.alloc(0)),
        () => health,
      ),
    ).toBeNull();
    // A root that turns DIRTY while the device answers refuses that answer too.
    health = { status: "CLEAN" };
    const late = relayedAnchorDevice(
      rootOf(dev, async (t, p) => {
        const a = dev.answer(t, p);
        health = { status: "DIRTY", reason: "tamper during the answer" };
        return a;
      }),
      () => health,
    )!;
    expect(await codeOf(late.anchorOpen(dev.raw))).toMatch(/hardware root DIRTY/);
  });

  it("on command set 0.4 a relayed read is never taken as fresh: the reader reports its stored copy as offline", async () => {
    const dev = new StandIn();
    const d = relayedAnchorDevice(
      rootOf(dev, async (t, p) => dev.answer(t, p)),
      clean,
    )!;
    await expect(d.anchorGet()).rejects.toBeInstanceOf(RelayedAnchorReadError);
    const file = path.join(dir, "offline.anchor");
    const sink = enclawederHeadAnchor({ device: d, devicePublicKey: dev.raw, path: file });
    await sink.write(head(5).toString("hex"));
    expect(await sink.readAttested!()).toEqual({
      head: head(5).toString("hex"),
      attested: "offline",
    });
  });

  it("another process holding the channel raises BUSY; another taking it over raises HIJACKED", async () => {
    const dev = new StandIn();
    let busy = true;
    const d = relayedAnchorDevice(
      rootOf(dev, async (t, p) =>
        t === 0x19 && busy ? Buffer.from([7, 0x10, 0x27, 0, 0]) : dev.answer(t, p),
      ),
      clean,
    )!;
    const sink = enclawederHeadAnchor({
      device: d,
      devicePublicKey: dev.raw,
      path: path.join(dir, "busy.anchor"),
    });
    expect(await codeOf(sink.write(head(6).toString("hex")))).toBe("ANCHOR_SESSION_BUSY");
    busy = false;

    let takenOver = false;
    const d2 = relayedAnchorDevice(
      rootOf(dev, async (t, p) => {
        if (t === 0x17 && takenOver) {
          takenOver = false;
          // Another session was opened in between: the device dropped ours (ERR_AUTH).
          dev.sid += 1n;
          return Buffer.from([5]);
        }
        return dev.answer(t, p);
      }),
      clean,
    )!;
    const sink2 = enclawederHeadAnchor({
      device: d2,
      devicePublicKey: dev.raw,
      path: path.join(dir, "hijack.anchor"),
    });
    await sink2.write(head(7).toString("hex"));
    takenOver = true;
    expect(await codeOf(sink2.write(head(8).toString("hex")))).toBe("ANCHOR_SESSION_HIJACKED");
  });
});

describe("the kit decides whether a session may anchor", () => {
  const pub = randomBytes(32);
  const authenticated = { anchorOpen: async () => null, anchorGet: async () => null };
  it("a bound session needs an authenticated anchor; an unbound one needs none", () => {
    expect(decideSessionAnchor({ bound: false, device: null, devicePublicKey: null })).toEqual({
      ok: true,
      mode: "none",
    });
    expect(
      decideSessionAnchor({
        bound: true,
        device: authenticated,
        devicePublicKey: pub,
        relayed: true,
      }),
    ).toMatchObject({ ok: true, mode: "authenticated", relayed: true });
    expect(
      decideSessionAnchor({
        bound: true,
        device: { anchorSet: async () => null, anchorGet: async () => null },
        devicePublicKey: pub,
      }),
    ).toMatchObject({ ok: false, code: "anchor-unauthenticated" });
    expect(decideSessionAnchor({ bound: true, device: null, devicePublicKey: pub })).toMatchObject({
      ok: false,
      code: "anchor-unavailable",
    });
    expect(
      decideSessionAnchor({ bound: true, device: authenticated, devicePublicKey: null }),
    ).toMatchObject({ ok: false, code: "anchor-unavailable" });
    expect(() =>
      requireSessionAnchor(decideSessionAnchor({ bound: true, device: {}, devicePublicKey: pub })),
    ).toThrow(SessionAnchorRefused);
  });
});
