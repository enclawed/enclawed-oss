// Device activation for a CLIENT of the machine's device owner (the broker): the device-verified
// second factor relayed through an untrusted owner (hardware-root/relayed-factors.ts). A real
// socket, a real connectRoot (certificates and attestation verified as in production), and a
// stand-in device that answers the public host protocol (LATCH_GET, SEAL_OPEN / SEALED,
// TOTP_VERIFY, UNLOCK_GRANT, UNLOCK_USE) with per-test keys. No real device is involved.
//
// Proves: a client passes interactive (device-verified code) and headless (device-counted
// unlock) activation through the owner; the owner sees only ciphertext; and a replayed answer,
// another client's answer, a forged "healthy" owner, an owner relaying to another device, and a
// DIRTY root all refuse.
import {
  createHash,
  createHmac,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  sign as edSign,
  timingSafeEqual,
  type KeyObject,
} from "node:crypto";
import fs, { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SecondFactorResult } from "../auth/index.js";
import {
  bindingNames,
  clearActivations,
  CS05_REFLASH_RUNBOOK,
  deviceFactorActivations,
  proveCommandSet05,
} from "../hardware-root/activation.js";
import { decideAuditAnchorVerdict } from "../hardware-root/audit-anchor-verdict.js";
import {
  claimOwnership,
  connectRoot,
  schedulerFor,
  serveRoot,
  type RemoteRoot,
  type RootService,
} from "../hardware-root/broker.js";
import {
  TAG_UNLOCK_GRANT,
  TAG_UNLOCK_STATE,
  TAG_UNLOCK_USE,
} from "../hardware-root/device-factors.js";
import type { LatchFrameDevice } from "../hardware-root/device-latch.js";
import { deriveDeviceKey, KEY_DERIVE_RESIDUAL } from "../hardware-root/key-derive.js";
import { relayedTotpAccess } from "../hardware-root/relayed-factors.js";
import { verdictMessage } from "../hardware-root/totp-verify.js";
import { commandSetPin } from "./command-set-pin.js";
import {
  type CredentialKeyDevice,
  credentialStoreKeys,
  forgetLaunchCredentialKeys,
} from "./credential-keys.js";
import { migrateLegacyLoginSeal, sealLoginFile, unsealLoginToMemory } from "./login-seal.js";
import {
  activateSession,
  deviceActivation,
  deviceSecondFactor,
  frameworkDeviceTotp,
  issueDeviceUnlock,
  spendDeviceUnlock,
  unlockScope,
  type DeviceTotpSeam,
} from "./session.js";

/** The unlock ticket a grant is bound to (its body digest and the credential that signed it). */
const TB = { digest: "7".repeat(64), credentialId: "cred-person" };
/** The job a test unlock delegates. */
const JOB = {
  name: "test-job",
  measurementDigest: "1".repeat(64),
  policyDigest: "2".repeat(64),
  projectDigest: "3".repeat(64),
  kind: "headless:print",
};

const dir = mkdtempSync(path.join(os.tmpdir(), "brokered-act-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const CODE = "123456";
const X25519_SPKI = Buffer.from("302a300506032b656e032100", "hex");
const T = (s: string) => Buffer.from(s, "latin1");
const raw = (k: KeyObject) => Buffer.from(k.export({ format: "der", type: "spki" }).subarray(12));
const le = (bytes: number, v: bigint | number) => {
  const b = Buffer.alloc(bytes);
  if (bytes === 8) {
    b.writeBigUInt64LE(BigInt(v));
  } else if (bytes === 4) {
    b.writeUInt32LE(Number(v));
  } else {
    b.writeUInt16LE(Number(v));
  }
  return b;
};

// The test's own manufacturer root: connectRoot is told to demand exactly it.
const root = generateKeyPairSync("ed25519");
const rootPub = raw(root.publicKey);

/**
 * A stand-in Enclaweder answering the public host protocol with its own per-test key, certified
 * by the test root. It refuses the factor-carrying commands outside the sealed channel, so every
 * code in these tests provably crossed the owner sealed.
 */
function standInDevice(uidByte: number, o: { cs05?: boolean } = {}) {
  const id = generateKeyPairSync("ed25519");
  const pub = raw(id.publicKey);
  const uid = Buffer.alloc(12, uidByte);
  const certBody = Buffer.concat([
    Buffer.from([1]),
    uid,
    pub,
    le(2, 1),
    le(4, 20_261_123),
    createHash("sha256").update(rootPub).digest().subarray(0, 4),
  ]);
  const cert = Buffer.concat([certBody, edSign(null, certBody, root.privateKey)]);
  const st = {
    latchSet: false,
    seals: new Map<bigint, { kEnc: Buffer; kMac: Buffer }>(),
    nextSeal: 1n,
    grant: null as null | { gid: bigint; uses: number; used: number; scope: Buffer },
    codesSeen: [] as string[],
    /** Command set 0.5: the activations it holds, by request nonce, and what it spent them for. */
    acts: new Map<string, { bind: Buffer; key: boolean }>(),
    /** CHALLENGE signatures it made (the old credential key's message, among others). */
    challenges: 0,
    clearUnlockUses: 0,
    /** The latch sequence number: every verdict is its own record (a pass's counter names it). */
    seq: 6n,
  };
  /** The binding the device writes (host protocol): kind rsv use_index step gid boot counter. */
  const binding = (
    kind: 1 | 2,
    f: { useIndex?: number; step?: number; gid?: bigint; counter?: bigint },
  ) => {
    const b = Buffer.alloc(32);
    b[0] = kind;
    b.writeUInt16LE(f.useIndex ?? 0, 2);
    b.writeUInt32LE(f.step ?? 0, 4);
    b.writeBigUInt64LE(f.gid ?? 0n, 8);
    b.writeBigUInt64LE(5n, 16);
    b.writeBigUInt64LE(f.counter ?? 0n, 24);
    return b;
  };
  const unlockUse = (p: Buffer): Buffer => {
    const nonce = p.subarray(0, 32);
    const gid = p.readBigUInt64LE(32);
    const scope = Buffer.from(p.subarray(48, 80));
    if (!st.grant || st.grant.used >= st.grant.uses) {
      return signed(2, TAG_UNLOCK_STATE, nonce, unlockBody(3, 2, scope, 0));
    }
    if (gid !== st.grant.gid || !scope.equals(st.grant.scope)) {
      return Buffer.from([5]);
    }
    st.grant.used++;
    if (o.cs05) {
      st.acts.set(nonce.toString("hex"), {
        bind: binding(1, { useIndex: st.grant.used, gid }),
        key: false,
      });
    }
    return signed(0, TAG_UNLOCK_USE, nonce, unlockBody(2, 1, scope, st.grant.used));
  };
  const signed = (status: number, tag: Buffer, nonce: Buffer, body: Buffer) =>
    Buffer.concat([
      Buffer.from([status]),
      body,
      edSign(null, Buffer.concat([tag, nonce, body]), id.privateKey),
    ]);
  const unlockBody = (kind: number, state: number, scope: Buffer, useIndex: number) => {
    const b = Buffer.alloc(100);
    b[0] = 1;
    b[1] = state;
    b[3] = kind;
    b.writeUInt16LE(st.grant?.uses ?? 0, 4);
    b.writeUInt16LE(st.grant?.used ?? 0, 6);
    b.writeBigUInt64LE(st.grant?.gid ?? 0n, 8);
    b.writeBigUInt64LE(5n, 16);
    b.writeUInt32LE(600_000, 24);
    b.writeBigUInt64LE(BigInt(Math.floor(Date.now() / 1000)), 40);
    b.writeUInt16LE(useIndex, 52);
    uid.copy(b, 56);
    scope.copy(b, 68);
    return b;
  };
  const factorOp = (
    op: number,
    inner: Buffer,
    seal: { id: bigint; kEnc: Buffer; kMac: Buffer },
  ): Buffer => {
    if (op === 0x31 || op === 0x39) {
      if (!o.cs05) {
        // Command set 0.4: neither is carried sealed (ERR_BAD_ARG before anything is read).
        return Buffer.from([1]);
      }
      if (op === 0x31) {
        return unlockUse(inner);
      }
      // KEY_DERIVE: SHA3-256 of the device's signature over its own tag, uid and the label.
      const a = st.acts.get(inner.subarray(0, 32).toString("hex"));
      if (!a || a.key) {
        return Buffer.from([5]);
      }
      a.key = true;
      const key = createHash("sha3-256")
        .update(
          edSign(
            null,
            Buffer.concat([T("enclaweder.key-derive.v1"), uid, inner.subarray(32, 64)]),
            id.privateKey,
          ),
        )
        .digest();
      const ks = createHmac("sha3-256", seal.kEnc)
        .update(Buffer.concat([T("ECW-SEAL-RSTR-01"), Buffer.from([0])]))
        .digest();
      const ct = Buffer.from(key.map((x, i) => x ^ ks[i]));
      const tag = createHmac("sha3-256", seal.kMac)
        .update(
          Buffer.concat([
            T("ECW-SEAL-RMAC-01"),
            uid,
            le(8, seal.id),
            Buffer.from([0x39]),
            a.bind,
            ct,
          ]),
        )
        .digest();
      return Buffer.concat([Buffer.from([0]), a.bind, ct, tag]);
    }
    const nonce = inner.subarray(0, 32);
    const code = String(inner.readUInt32LE(32)).padStart(6, "0");
    st.codesSeen.push(code);
    if (op === 0x2d) {
      const t = Number(inner.readBigUInt64LE(36));
      const pass = code === CODE;
      st.seq += 1n;
      if (pass && o.cs05 && inner[44] === 1) {
        st.acts.set(Buffer.from(nonce).toString("hex"), {
          bind: binding(2, { step: Math.floor(t / 30), counter: st.seq }),
          key: false,
        });
      }
      const body = Buffer.concat([
        Buffer.from([1, inner[44], pass ? 1 : 0, pass ? 0 : 1]),
        le(4, pass ? Math.floor(t / 30) : 0),
        le(8, st.seq),
        le(4, 0),
        uid,
      ]);
      return Buffer.concat([
        Buffer.from([pass ? 0 : 5]),
        body,
        edSign(null, verdictMessage(Buffer.from(nonce), body), id.privateKey),
      ]);
    }
    if (op === 0x30) {
      if (code !== CODE) {
        return Buffer.from([5, 0, 0, 0, 0]);
      }
      const scope = Buffer.from(inner.subarray(50, 82));
      st.grant = { gid: 42n, uses: inner.readUInt16LE(44), used: 0, scope };
      return signed(0, TAG_UNLOCK_GRANT, nonce, unlockBody(1, 1, scope, 0));
    }
    return Buffer.from([1]);
  };
  const dev: LatchFrameDevice = {
    async request(type, _id, p = Buffer.alloc(0)) {
      switch (type) {
        case 0x1c: {
          // LATCH_GET: clear (or set) latch, live armed session, valid TOTP factor.
          const b = Buffer.alloc(64);
          b[0] = 1;
          b[1] = st.latchSet ? 1 : 0;
          b[4] = 0x02 | 0x08 | 0x10;
          b.writeBigUInt64LE(9n, 24);
          b[48] = 2;
          uid.copy(b, 52);
          return { payload: signed(0, T("ECW-LATCH-GET-01"), p, b) };
        }
        case 0x35: {
          const cpub = p.subarray(0, 32);
          const cn = p.subarray(32, 48);
          const eph = generateKeyPairSync("x25519");
          const dpub = raw(eph.publicKey);
          const dn = randomBytes(16);
          const sid = st.nextSeal++;
          const shared = diffieHellman({
            privateKey: eph.privateKey,
            publicKey: createPublicKey({
              key: Buffer.concat([X25519_SPKI, cpub]),
              format: "der",
              type: "spki",
            }),
          });
          const salt = Buffer.concat([cn, dn]);
          const tail = Buffer.concat([uid, le(8, sid), cpub, dpub]);
          const k = (label: string) =>
            Buffer.from(hkdfSync("sha3-256", shared, salt, Buffer.concat([T(label), tail]), 32));
          st.seals.set(sid, { kEnc: k("ECW-SEAL-KENC-01"), kMac: k("ECW-SEAL-KMAC-01") });
          const sig = edSign(
            null,
            Buffer.concat([T("ECW-SEAL-OPEN-01"), uid, le(8, sid), cpub, dpub, cn, dn]),
            id.privateKey,
          );
          return { payload: Buffer.concat([Buffer.from([0]), le(8, sid), dpub, dn, uid, sig]) };
        }
        case 0x36: {
          const sid = p.readBigUInt64LE(0);
          const op = p[8];
          const len = p.readUInt16LE(9);
          const ct = p.subarray(11, 11 + len);
          const tag = p.subarray(11 + len, 11 + len + 32);
          const seal = st.seals.get(sid);
          st.seals.delete(sid); // one use, whatever the outcome
          const want = seal
            ? createHmac("sha3-256", seal.kMac)
                .update(
                  Buffer.concat([
                    T("ECW-SEAL-MACT-01"),
                    uid,
                    le(8, sid),
                    Buffer.from([op]),
                    le(2, len),
                    ct,
                  ]),
                )
                .digest()
            : null;
          if (!want || tag.length !== 32 || !timingSafeEqual(want, tag)) {
            return { payload: Buffer.from([5]) };
          }
          const inner = Buffer.from(ct);
          for (let off = 0, i = 0; off < inner.length; off += 32, i++) {
            const ks = createHmac("sha3-256", seal!.kEnc)
              .update(Buffer.concat([T("ECW-SEAL-KSTR-01"), Buffer.from([i])]))
              .digest();
            for (let j = 0; j < 32 && off + j < inner.length; j++) {
              inner[off + j] ^= ks[j];
            }
          }
          return { payload: factorOp(op, inner, { id: sid, ...seal! }) };
        }
        case 0x31:
          st.clearUnlockUses++;
          return { payload: unlockUse(p) };
        case 0x03: {
          // CHALLENGE: "ECW-CHALLENGE-01" | nonce | uid, for anyone.
          st.challenges++;
          return {
            payload: Buffer.concat([
              Buffer.from([0]),
              uid,
              edSign(null, Buffer.concat([T("ECW-CHALLENGE-01"), p, uid]), id.privateKey),
            ]),
          };
        }
        case 0x38: {
          if (!o.cs05) {
            return { payload: Buffer.from([8]) };
          }
          // ANCHOR_READ: never anchored, signed over the caller's nonce.
          const body = Buffer.alloc(112);
          body[0] = 1;
          uid.copy(body, 44);
          return {
            payload: Buffer.concat([
              Buffer.from([0]),
              body,
              edSign(null, Buffer.concat([T("enclaweder.anchor-read.v1"), p, body]), id.privateKey),
            ]),
          };
        }
        default:
          // TOTP_VERIFY / UNLOCK_GRANT in the clear, or anything else: refused.
          return { payload: Buffer.from([1]) };
      }
    },
  };
  return {
    dev,
    st,
    member: {
      uid: uid.toString("hex"),
      pubkey: pub.toString("hex"),
      serial: `ENCLW-${uid.toString("hex").toUpperCase()}`,
      cert: cert.toString("hex"),
    },
    key: id.privateKey,
  };
}
type Device = ReturnType<typeof standInDevice>;

/** What a (possibly hostile) owner does with the client's relay requests. */
type Relay = {
  sealed(type: 0x35 | 0x36, payload: Buffer): Promise<Buffer>;
  unlockUse(payload: Buffer): Promise<Buffer>;
  /** ANCHOR_READ (command set 0.5); default: relayed to the device as is. */
  anchor?(type: number, payload: Buffer): Promise<Buffer>;
};
const honest = (d: Device): Relay => ({
  sealed: async (type, p) => (await d.dev.request(type, 1, p))?.payload ?? Buffer.alloc(0),
  unlockUse: async (p) => (await d.dev.request(0x31, 1, p))?.payload ?? Buffer.alloc(0),
});

const open: Array<{ close(): unknown }> = [];
afterEach(async () => {
  for (const o of open.splice(0).toReversed()) {
    await o.close();
  }
});
let n = 0;

/** An owner on a real socket: it attests `d` (genuinely) and relays as `relay` says. */
async function owner(d: Device, relay: Relay = honest(d)) {
  const frames: Buffer[] = [];
  const clearUses: Buffer[] = [];
  const svc: RootService = {
    members: () => [d.member],
    run: async () => {
      throw new Error("unused");
    },
    health: () => ({ status: "CLEAN" }), // the owner's claim; the client believes the device only
    attest: async (digest) => [
      { uid: d.member.uid, latch: (await d.dev.request(0x1c, 1, digest))!.payload.toString("hex") },
    ],
    relaySealed: (type, p) => {
      frames.push(Buffer.from(p));
      return relay.sealed(type, p);
    },
    relayUnlockUse: (p) => {
      frames.push(Buffer.from(p));
      clearUses.push(Buffer.from(p));
      return relay.unlockUse(p);
    },
    relayAnchor: async (type, p) =>
      relay.anchor
        ? relay.anchor(type, p)
        : ((await d.dev.request(type, 1, p))?.payload ?? Buffer.alloc(0)),
  };
  const p = path.join(dir, `o${++n}.sock`);
  const served = serveRoot(
    (await claimOwnership(p))!,
    Promise.resolve({ svc, scheduler: schedulerFor(svc) }),
  );
  open.push(served);
  return { path: p, frames, clearUses };
}

async function client(sock: string): Promise<{ remote: RemoteRoot; seam: DeviceTotpSeam }> {
  const remote = (await connectRoot(sock, 500, { rootPubkey: rootPub }))!;
  open.push(remote);
  const seam: DeviceTotpSeam = {
    ...frameworkDeviceTotp,
    access: () => relayedTotpAccess(remote, () => remote.health()),
  };
  return { remote, seam };
}

const FIDO: SecondFactorResult = { via: "fido2", credential: "k1" };
const TICKET: SecondFactorResult = { via: "ticket", credential: "k1", ticket: TB };
const TICKET_OF = (ticket: typeof TB): SecondFactorResult => ({
  via: "ticket",
  credential: "k1",
  ticket,
});
const typing = (code: string) => ({ readCode: async () => code });

describe("device activation for a client of the device owner", () => {
  it("passes interactively (a code the device verifies) and headless (a device-counted use), the owner seeing ciphertext only", async () => {
    const d = standInDevice(7);
    const o = await owner(d);
    const { seam } = await client(o.path);
    expect(seam.access()).not.toBeNull();
    const r = await deviceActivation(FIDO, typing(CODE), { seam });
    expect(r.device).toBe("device-totp");

    const g = await issueDeviceUnlock({
      host: "h",
      ticket: TB,
      job: JOB,
      code: CODE,
      uses: 2,
      leaseS: 600,
      device: seam,
    });
    expect(g.ok).toBe(true);
    if (!g.ok) {
      return;
    }
    const a = await deviceActivation(TICKET, {}, { seam, host: "h", unlock: g.grant, job: JOB });
    expect(a.device).toBe("device-unlock");
    expect(a.unlockReceipt?.tag).toBe("use");
    expect(
      (await spendDeviceUnlock(g.grant, { host: "h", ticket: TB, job: JOB, device: seam })).ok,
    ).toBe(true);
    // The owner relays at most 8 sealed frames a second per client (each use tries a seal first).
    await new Promise((r) => setTimeout(r, 1100));
    // Uses are counted by the device, not by the client or the owner.
    const third = await spendDeviceUnlock(g.grant, {
      host: "h",
      ticket: TB,
      job: JOB,
      device: seam,
    });
    expect(!third.ok && third.code).toBe("no-grant");
    expect(d.st.grant?.used).toBe(2);

    // The device read the code; nothing the owner relayed carries it in the clear.
    expect(d.st.codesSeen).toEqual([CODE, CODE]);
    const codeBytes = le(4, Number(CODE));
    expect(o.frames.length).toBeGreaterThan(0);
    for (const f of o.frames) {
      expect(f.includes(codeBytes)).toBe(false);
    }
  });

  it("a wrong code is refused by the device, through the owner", async () => {
    const d = standInDevice(8);
    const { seam } = await client((await owner(d)).path);
    await expect(deviceActivation(FIDO, typing("000000"), { seam })).rejects.toThrow(
      /did not accept/,
    );
    const g = await issueDeviceUnlock({
      host: "h",
      ticket: TB,
      job: JOB,
      code: "000000",
      uses: 1,
      leaseS: 600,
      device: seam,
    });
    expect(!g.ok && g.code).toBe("rejected");
  });

  it("attack: a replayed answer (the owner re-sends the device's earlier verdict or receipt) is refused", async () => {
    const d = standInDevice(9);
    const real = honest(d);
    let lastSealed: Buffer | null = null;
    let lastUse: Buffer | null = null;
    const replaying: Relay = {
      sealed: async (type, p) => {
        // The SEALED header's op byte is in the clear: the owner replays the factor answers.
        if (type === 0x36 && lastSealed && p[8] !== 0x31) {
          return lastSealed;
        }
        const a = await real.sealed(type, p);
        if (type === 0x36) {
          lastSealed = a;
        }
        return a;
      },
      unlockUse: async (p) => {
        if (lastUse) {
          return lastUse;
        }
        lastUse = await real.unlockUse(p);
        return lastUse;
      },
    };
    const { seam } = await client((await owner(d, replaying)).path);
    expect((await deviceActivation(FIDO, typing(CODE), { seam })).device).toBe("device-totp");
    // Every later sealed answer is the first verdict: signed over another nonce.
    await expect(deviceActivation(FIDO, typing(CODE), { seam })).rejects.toThrow(/did not accept/);
    // A grant request answered with that verdict is no grant either.
    const g = await issueDeviceUnlock({
      host: "h",
      ticket: TB,
      job: JOB,
      code: CODE,
      uses: 3,
      leaseS: 600,
      device: seam,
    });
    expect(g.ok).toBe(false);
    // A grant held by the device; the owner replays the first receipt to every later spend.
    const grant = realGrant(d);
    await new Promise((r) => setTimeout(r, 1100)); // the owner's sealed-frame rate (8 a second)
    const first = await spendDeviceUnlock(grant, { host: "h", ticket: TB, job: JOB, device: seam });
    expect(first.ok, first.ok ? "" : first.message).toBe(true);
    await new Promise((r) => setTimeout(r, 1100));
    const again = await spendDeviceUnlock(grant, { host: "h", ticket: TB, job: JOB, device: seam });
    expect(!again.ok && again.code).toBe("bad-receipt");
    await expect(
      deviceActivation(TICKET, {}, { seam, host: "h", unlock: grant, job: JOB }),
    ).rejects.toThrow(/does not verify/);
  });

  it("attack: another client's answer handed to this client is refused", async () => {
    const d = standInDevice(10);
    const real = honest(d);
    // The owner keeps the first client's answers and hands them to whoever asks next.
    const kept: { sealed: Buffer | null; use: Buffer | null } = { sealed: null, use: null };
    let stealing = false;
    const swapping: Relay = {
      sealed: async (type, p) => {
        if (type === 0x36 && stealing && kept.sealed) {
          return kept.sealed;
        }
        const a = await real.sealed(type, p);
        if (type === 0x36) {
          kept.sealed = a;
        }
        return a;
      },
      unlockUse: async (p) => {
        if (stealing && kept.use) {
          return kept.use;
        }
        kept.use = await real.unlockUse(p);
        return kept.use;
      },
    };
    const o = await owner(d, swapping);
    const A = await client(o.path);
    const B = await client(o.path);
    const g = await issueDeviceUnlock({
      host: "h",
      ticket: TB,
      job: JOB,
      code: CODE,
      uses: 4,
      leaseS: 600,
      device: A.seam,
    });
    if (!g.ok) {
      throw new Error("grant");
    }
    expect((await deviceActivation(FIDO, typing(CODE), A)).device).toBe("device-totp");
    expect(
      (await deviceActivation(TICKET, {}, { ...A, host: "h", unlock: g.grant, job: JOB })).device,
    ).toBe("device-unlock");
    stealing = true;
    await expect(deviceActivation(FIDO, typing(CODE), B)).rejects.toThrow(/did not accept/);
    await expect(
      deviceActivation(TICKET, {}, { ...B, host: "h", unlock: g.grant, job: JOB }),
    ).rejects.toThrow(/does not verify/);
  });

  it("attack: a forged healthy owner (answers the factor calls itself) is refused", async () => {
    const d = standInDevice(11);
    // The owner proves the genuine device's latch (it relays attestation) but answers every factor
    // request itself: a seal-open and a PASS / receipt signed with a key of its own.
    const forger = generateKeyPairSync("ed25519");
    const forging: Relay = {
      sealed: async (type) => {
        if (type === 0x35) {
          const b = Buffer.concat([
            Buffer.from([0]),
            randomBytes(8 + 32 + 16),
            Buffer.from(d.member.uid, "hex"),
          ]);
          return Buffer.concat([b, edSign(null, b, forger.privateKey)]);
        }
        return Buffer.concat([Buffer.from([0]), randomBytes(96)]);
      },
      unlockUse: async (p) => {
        const body = Buffer.alloc(100);
        return Buffer.concat([
          Buffer.from([0]),
          body,
          edSign(null, Buffer.concat([TAG_UNLOCK_USE, p.subarray(0, 32), body]), forger.privateKey),
        ]);
      },
    };
    const { seam } = await client((await owner(d, forging)).path);
    await expect(deviceActivation(FIDO, typing(CODE), { seam })).rejects.toThrow(/did not accept/);
    const g = await issueDeviceUnlock({
      host: "h",
      ticket: TB,
      job: JOB,
      code: CODE,
      uses: 1,
      leaseS: 600,
      device: seam,
    });
    expect(!g.ok && g.code).toBe("bad-receipt");
    const grant = realGrant(d);
    await expect(
      deviceActivation(TICKET, {}, { seam, host: "h", unlock: grant, job: JOB }),
    ).rejects.toThrow(/does not verify/);
    // An owner that cannot prove a certified device at all is refused at connect.
    const fake = standInDevice(12);
    const uncert = { ...fake, member: { ...fake.member, cert: d.member.cert } };
    await expect(
      connectRoot((await owner(uncert)).path, 500, { rootPubkey: rootPub }),
    ).rejects.toThrow(/certificate/);
  });

  it("attack: an owner relaying to a different (genuine) device is refused", async () => {
    const d = standInDevice(13);
    const other = standInDevice(14); // also certified by the same root, but not the attested member
    const { seam } = await client((await owner(d, honest(other))).path);
    await expect(deviceActivation(FIDO, typing(CODE), { seam })).rejects.toThrow(/did not accept/);
    const g = await issueDeviceUnlock({
      host: "h",
      ticket: TB,
      job: JOB,
      code: CODE,
      uses: 1,
      leaseS: 600,
      device: seam,
    });
    expect(!g.ok && g.code).toBe("bad-receipt");
    expect(other.st.codesSeen).toEqual([]); // the seal never opened on the other device
    other.st.grant = { gid: 42n, uses: 5, used: 0, scope: unlockScope("h", TB, JOB) };
    const grant = realGrant(d);
    await expect(
      deviceActivation(TICKET, {}, { seam, host: "h", unlock: grant, job: JOB }),
    ).rejects.toThrow(/does not verify/);
    // Command set 0.5: the use is tried sealed first, and the seal's opening does not verify under
    // the certified key, so nothing is spent on the other device either.
    expect(other.st.grant.used).toBe(0);
  });

  it("a DIRTY root refuses: no access, activation refused, and a root that turns DIRTY refuses mid-session", async () => {
    const d = standInDevice(15);
    d.st.latchSet = true;
    const dirty = await client((await owner(d)).path);
    expect(dirty.remote.health().status).toBe("DIRTY");
    expect(dirty.seam.access()).toBeNull();
    await expect(
      activateSession({}, { device: dirty.seam, bound: true, allowTicket: true }),
    ).rejects.toThrow(/cannot verify an authenticator code here/);

    const d2 = standInDevice(16);
    const live = await client((await owner(d2)).path);
    const access = live.seam.access();
    expect(access).not.toBeNull();
    d2.st.latchSet = true;
    const until = Date.now() + 5000;
    while (live.remote.health().status !== "DIRTY" && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(live.remote.health().status).toBe("DIRTY");
    // The access obtained while CLEAN refuses now, before asking the device anything.
    const seen = d2.st.codesSeen.length;
    await expect(access!.run(async () => 1)).rejects.toThrow(/DIRTY/);
    await expect(
      deviceActivation(FIDO, typing(CODE), { seam: { ...live.seam, access: () => access } }),
    ).rejects.toThrow();
    expect(d2.st.codesSeen.length).toBe(seen);
  });
});

/** A grant issued at `d` directly (the device's own state), for the spend attacks. */
function realGrant(d: Device) {
  const scope = unlockScope("h", TB, JOB);
  d.st.grant = { gid: 42n, uses: 5, used: 0, scope };
  return {
    v: 2 as const,
    ticket: TB,
    job: JOB,
    host: "h",
    gid: "42",
    boot: "5",
    uses: 5,
    leaseMs: 600_000,
    devicePub: d.member.pubkey,
    deviceUid: d.member.uid,
    scope: scope.toString("hex"),
    record: {
      v: 1 as const,
      tag: "grant" as const,
      uid: "",
      pubkey: "",
      nonce: "",
      body: "",
      sig: "",
    },
  };
}

/** The device as the credential store's key device, through `remote` (the client's view). */
function keyDevice(d: Device, remote: RemoteRoot): CredentialKeyDevice {
  const pub = Buffer.from(d.member.pubkey, "hex");
  const uid = Buffer.from(d.member.uid, "hex");
  return {
    uid: d.member.uid,
    sign: async (m) => (await d.dev.request(0x03, 1, m))!.payload.subarray(13, 77),
    keyDerivation: {
      pubkey: d.member.pubkey,
      commandSet: () => proveCommandSet05((n) => remote.relayAnchor(0x38, n), pub, uid),
      derive: (label) => deriveDeviceKey((t, p) => remote.relaySealed(t, p), pub, uid, label),
    },
  };
}

const pause = () => new Promise((r) => setTimeout(r, 1100)); // the owner's per-second relay rates

describe("command set 0.5 through the owner", () => {
  beforeEach(() => {
    clearActivations();
    forgetLaunchCredentialKeys();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("each launch's auth.device-factor record names its activation (interactive code, the gate's code, an unlock use): a head bound to it verifies; bound to another activation, or unbound, is anchor-unbound", async () => {
    const d = standInDevice(21, { cs05: true });
    const o = await owner(d);
    const records: { type: string; payload: Record<string, unknown> }[] = [];
    const audit = async (e: { type: string; payload: Record<string, unknown> }) => {
      records.push(e);
    };
    // Interactive, FIDO2 passed: the device verifies a code.
    const c1 = await client(o.path);
    expect(
      (await deviceActivation(FIDO, { ...typing(CODE), audit }, { seam: c1.seam })).device,
    ).toBe("device-totp");
    // Interactive, the gate took the device's verdict itself (no FIDO2 key enrolled).
    const c2 = await client(o.path);
    const factor = deviceSecondFactor(c2.seam)!;
    await pause();
    expect((await factor.verify({ purpose: "session-start", code: CODE })).ok).toBe(true);
    await deviceActivation(
      { via: "device-totp", credential: null },
      { audit, deviceFactor: factor },
      { seam: c2.seam },
    );
    // Headless: one device-counted use of a grant.
    const c3 = await client(o.path);
    const grant = realGrant(d);
    await deviceActivation(
      TICKET,
      { audit },
      { seam: c3.seam, host: "h", unlock: grant, job: JOB },
    );

    const verified = records.filter((r) => r.type === "auth.device-factor");
    expect(verified.map((r) => r.payload.via)).toEqual([
      "device-totp",
      "device-totp",
      "device-unlock",
    ]);
    for (const r of verified.slice(0, 2)) {
      expect(typeof r.payload.step).toBe("number");
      expect(r.payload.counter).toMatch(/^\d+$/);
    }
    expect(verified[0].payload.counter).not.toBe(verified[1].payload.counter);
    expect(verified[2].payload).toMatchObject({ gid: "42", useIndex: 1, boot: "5" });
    // An adapter prefixes its records; the verifier reads any prefix.
    const facts = deviceFactorActivations(
      records.map((r) => ({ type: `host.${r.type}`, payload: r.payload })),
    );
    expect(facts.map((f) => f.kind)).toEqual(["totp", "totp", "unlock-use"]);
    // What the DEVICE bound for each activation (its own table, written as the host protocol says).
    const binds = [...d.st.acts.values()].map((a) => a.bind);
    expect(binds).toHaveLength(3);
    const claims = [{ line: 1, type: "host.launch", hardware: "held" }];
    const verdict = (bind: Buffer | null, activations = facts) =>
      decideAuditAnchorVerdict({
        claims,
        device: "matched",
        attestation: {
          fresh: true,
          counter: "4",
          sess: "2",
          version: bind ? 3 : 2,
          bind: bind?.toString("hex") ?? null,
        },
        activations,
      });
    for (const bind of binds) {
      expect(verdict(bind)).toEqual({ ok: true, rootClaimed: true });
      // A log that does not record this activation (another launch's log, or a forger's) does not verify.
      const others = facts.filter((f) => !bindingNames(bind, f));
      expect(others).toHaveLength(2);
      expect(verdict(bind, others)).toMatchObject({ ok: false, code: "anchor-unbound" });
    }
    // A head set by an unbound session does not verify, whatever the log records.
    expect(verdict(null)).toMatchObject({ ok: false, code: "anchor-unbound" });
    // A device-totp record without step and counter (an adapter's own factor) names nothing.
    const bare = verified.map((r) =>
      r.payload.via === "device-totp" ? { ...r, payload: { ...r.payload, step: undefined } } : r,
    );
    expect(verdict(binds[0], deviceFactorActivations(bare))).toMatchObject({
      ok: false,
      code: "anchor-unbound",
    });
  });

  it("a device seam that reports no step or counter still activates; its record names nothing (it cannot match a bound head)", async () => {
    const d = standInDevice(29, { cs05: true });
    const c = await client((await owner(d)).path);
    const seam: DeviceTotpSeam = {
      ...c.seam,
      verifyRecord: (rec, e) => {
        const v = c.seam.verifyRecord(rec, e);
        return v.ok ? ({ ok: true } as unknown as typeof v) : v;
      },
    };
    const records: { type: string; payload: Record<string, unknown> }[] = [];
    const r = await deviceActivation(
      FIDO,
      { ...typing(CODE), audit: async (e) => void records.push(e) },
      { seam },
    );
    expect(r.device).toBe("device-totp");
    expect(records.at(-1)?.payload).toMatchObject({ outcome: "verified", via: "device-totp" });
    expect(records.at(-1)?.payload.step).toBeUndefined();
    expect(deviceFactorActivations(records)).toEqual([]);
  });

  it("pin: a 0.5 device proves itself through the owner; an owner claiming 0.4, or replaying a read, refuses a root-required launch naming the runbook", async () => {
    const d = standInDevice(22, { cs05: true });
    const pub = Buffer.from(d.member.pubkey, "hex");
    const uid = Buffer.from(d.member.uid, "hex");
    const proverVia = async (relay?: Relay) => {
      const c = await client((await owner(d, relay)).path);
      return () => proveCommandSet05((n) => c.remote.relayAnchor(0x38, n), pub, uid);
    };
    const honestProve = await proverVia();
    expect(await honestProve()).toEqual({ status: "proven", commandSet: "0.5" });
    expect(
      await commandSetPin({ rootRequired: true, deviceBound: true, prove: honestProve }),
    ).toMatchObject({ ok: true, residual: null });

    // The broker owner says "firmware before 0.5" (ERR_UNSUPPORTED to ANCHOR_READ).
    const liar = await proverVia({ ...honest(d), anchor: async () => Buffer.from([8]) });
    const refused = await commandSetPin({ rootRequired: true, deviceBound: true, prove: liar });
    expect(refused).toMatchObject({ ok: false, code: "firmware-too-old" });
    expect(!refused.ok && refused.message).toContain(CS05_REFLASH_RUNBOOK);
    // Without the root required it runs, and the launch records what that leaves open.
    expect(
      await commandSetPin({ rootRequired: false, deviceBound: true, prove: liar }),
    ).toMatchObject({ ok: true, residual: KEY_DERIVE_RESIDUAL });

    // The owner answers every read with the first one it saw: signed over another nonce.
    let first: Buffer | null = null;
    const replaying = await proverVia({
      ...honest(d),
      anchor: async (t, p) => (first ??= (await d.dev.request(t, 1, p))!.payload),
    });
    expect((await replaying()).status).toBe("proven");
    const stale = await commandSetPin({ rootRequired: true, deviceBound: true, prove: replaying });
    expect(stale).toMatchObject({ ok: false, code: "firmware-unproven" });
    // A real 0.4 device is "older" too: refused when required.
    const old = standInDevice(23);
    const oc = await client((await owner(old)).path);
    const oldProof = await proveCommandSet05(
      (n) => oc.remote.relayAnchor(0x38, n),
      Buffer.from(old.member.pubkey, "hex"),
      Buffer.from(old.member.uid, "hex"),
    );
    expect(oldProof.status).toBe("older");
  });

  it("root required: a relayed UNLOCK_USE never crosses the owner in the clear (a 0.4 device, or an owner faking its refusal); nothing is spent", async () => {
    const fakes0x31: Relay = {
      ...honest(standInDevice(99)),
      sealed: async () => Buffer.from([1]),
    };
    for (const [what, d, relay] of [
      ["a 0.4 device", standInDevice(24), undefined],
      ["an owner claiming 0.4", standInDevice(25, { cs05: true }), "fake"],
    ] as const) {
      const real = honest(d);
      const o = await owner(
        d,
        relay === "fake"
          ? {
              ...real,
              sealed: async (type, p) =>
                type === 0x36 && p[8] === 0x31 ? fakes0x31.sealed(type, p) : real.sealed(type, p),
            }
          : real,
      );
      const c = await client(o.path);
      const grant = realGrant(d);
      vi.stubEnv("ENCLAWEDER_ROOT", "required");
      const r = await spendDeviceUnlock(grant, { host: "h", ticket: TB, job: JOB, device: c.seam });
      vi.unstubAllEnvs();
      expect(r.ok, what).toBe(false);
      expect(!r.ok && r.message, what).toMatch(/never relayed in the clear/);
      expect(o.clearUses, what).toHaveLength(0);
      expect(d.st.clearUnlockUses, what).toBe(0);
      expect(d.st.grant!.used, what).toBe(0);
    }
    // The root not required: a 0.4 device keeps today's clear relay (its receipt is still verified).
    const d = standInDevice(26);
    const o = await owner(d);
    const c = await client(o.path);
    expect(
      (await spendDeviceUnlock(realGrant(d), { host: "h", ticket: TB, job: JOB, device: c.seam }))
        .ok,
    ).toBe(true);
    expect(o.clearUses).toHaveLength(1);
  });

  it("a sealed use outside the grant's job (another launch kind, project or ticket) is refused by the device as use-refused, never as a device error; nothing is spent; the job itself passes", async () => {
    const cases = [
      ["another launch kind", { ...JOB, kind: "headless" }, TB],
      ["another project", { ...JOB, projectDigest: "4".repeat(64) }, TB],
      ["another ticket", JOB, { ...TB, digest: "8".repeat(64) }],
      ["another credential", JOB, { ...TB, credentialId: "cred-attacker" }],
    ] as const;
    let k = 30;
    for (const [what, job, ticket] of cases) {
      const d = standInDevice(k++, { cs05: true });
      const o = await owner(d);
      const c = await client(o.path);
      const grant = realGrant(d);
      const r = await spendDeviceUnlock(grant, { host: "h", ticket, job, device: c.seam });
      expect(r.ok, what).toBe(false);
      expect(!r.ok && r.code, what).toBe("use-refused");
      expect(!r.ok && r.message, what).toMatch(/does not match its live unlock/);
      expect(!r.ok && r.message, what).not.toMatch(/did not answer as expected/);
      expect(o.clearUses, what).toHaveLength(0); // it went sealed
      expect(d.st.grant!.used, what).toBe(0);
      // The launch's activation says the same.
      await expect(
        deviceActivation(TICKET_OF(ticket), {}, { seam: c.seam, host: "h", unlock: grant, job }),
        what,
      ).rejects.toThrow(
        /needs a device unlock, and the Enclaweder refused this use: the launch does not match its live unlock/,
      );
      expect(d.st.grant!.used, what).toBe(0);
    }
    // The job itself: one use spent (no false refusal).
    const d = standInDevice(40, { cs05: true });
    const c = await client((await owner(d)).path);
    const ok = await spendDeviceUnlock(realGrant(d), {
      host: "h",
      ticket: TB,
      job: JOB,
      device: c.seam,
    });
    expect(ok.ok).toBe(true);
    expect(d.st.grant!.used).toBe(1);
    // An owner that alters the sealed use: refused the same way (the device cannot tell the client
    // which), nothing spent.
    const d2 = standInDevice(41, { cs05: true });
    const real = honest(d2);
    const o2 = await owner(d2, {
      ...real,
      sealed: async (type, p) => {
        if (type === 0x36 && p[8] === 0x31) {
          const t = Buffer.from(p);
          t[12] ^= 1;
          return real.sealed(type, t);
        }
        return real.sealed(type, p);
      },
    });
    const c2 = await client(o2.path);
    const t = await spendDeviceUnlock(realGrant(d2), {
      host: "h",
      ticket: TB,
      job: JOB,
      device: c2.seam,
    });
    expect(!t.ok && t.code).toBe("use-refused");
    expect(d2.st.grant!.used).toBe(0);
  });

  it("credential key: KEY_DERIVE on the launch's activation (never CHALLENGE), once per launch; a login sealed under the CHALLENGE key is moved once, audited, its old bytes overwritten; 0.4 keeps CHALLENGE with the residual, never when required", async () => {
    const work = mkdtempSync(path.join(dir, "ck-"));
    const keyFile = path.join(work, "state", "k.key");
    const sealedFile = path.join(work, "state", "login.sealed.json");
    const plainFile = path.join(work, "plain.json");
    const LOGIN = '{"token":"login-SECRET-test-only"}';
    const label = "host.login";
    const d = standInDevice(27, { cs05: true });
    const o = await owner(d);
    const c = await client(o.path);
    const kdev = keyDevice(d, c.remote);

    // No activation yet: no device key, and CHALLENGE is never asked for one.
    const k0 = await credentialStoreKeys({ keyFile, device: kdev, keyring: null });
    expect(k0.device).toMatchObject({ derivation: null });
    expect(k0.device?.problem).toMatch(/activation/);
    expect(k0.write.source).not.toBe("device");
    expect(d.st.challenges).toBe(0);

    // A login sealed by an earlier version: under the CHALLENGE key.
    const legacy = await credentialStoreKeys({
      keyFile,
      device: { uid: kdev.uid, sign: kdev.sign },
      keyring: null,
    });
    expect(legacy.device).toMatchObject({ derivation: "challenge", residual: KEY_DERIVE_RESIDUAL });
    fs.writeFileSync(plainFile, LOGIN, { mode: 0o600 });
    expect(
      sealLoginFile({ plainFile, sealedFile, keys: legacy, deviceBound: true, label }).ok,
    ).toBe(true);
    const oldBytes = fs.readFileSync(sealedFile);
    // A copy taken by hard link before the move: the move overwrites those bytes too.
    const copy = path.join(work, "copy.json");
    fs.linkSync(sealedFile, copy);
    const challenges = d.st.challenges;

    // The launch's activation, then the key.
    await deviceActivation(FIDO, typing(CODE), { seam: c.seam });
    await pause();
    const k1 = await credentialStoreKeys({ keyFile, device: kdev, keyring: null });
    expect(k1.device).toMatchObject({ derivation: "key-derive", residual: null, problem: null });
    expect(k1.write).toMatchObject({ source: "device" });
    expect(k1.write.id).toMatch(/^device:[0-9a-f]+:kd:[0-9a-f]{16}$/);
    expect(d.st.challenges).toBe(challenges);
    // Derived once on that activation; the launch's other store shares it.
    const k2 = await credentialStoreKeys({ keyFile, device: kdev, keyring: null });
    expect(k2.write.id).toBe(k1.write.id);
    expect([...d.st.acts.values()].filter((a) => a.key)).toHaveLength(1);

    // Not moved yet: the old record does not open under the new key.
    expect(unsealLoginToMemory({ sealedFile, keys: k1, deviceBound: true, label })).toMatchObject({
      ok: false,
      code: "key-unavailable",
    });
    // An audit that fails is reported (the adapter does not start).
    const failing = await migrateLegacyLoginSeal({
      sealedFile: path.join(work, "none.json"),
      keys: k1,
      deviceBound: true,
      label,
    });
    expect(failing).toEqual({ ok: true, migrated: false });
    const audited: { type: string; payload: Record<string, unknown> }[] = [];
    const m = await migrateLegacyLoginSeal({
      sealedFile,
      keys: k1,
      deviceBound: true,
      label,
      audit: async (e) => {
        audited.push(e);
      },
    });
    expect(m).toMatchObject({ ok: true, migrated: true, to: k1.write.id });
    expect(d.st.challenges).toBe(challenges + 2); // the old key, signed twice, for this only
    expect(audited).toEqual([
      {
        type: "auth.login-seal.migrated",
        payload: expect.objectContaining({ from: "device-challenge", to: "device-key-derive" }),
      },
    ]);
    expect(JSON.stringify(audited)).not.toContain("SECRET");
    const now = fs.readFileSync(sealedFile);
    expect(JSON.parse(now.toString("utf8")).key).toBe(k1.write.id);
    const back = unsealLoginToMemory({ sealedFile, keys: k1, deviceBound: true, label });
    expect(back.ok && back.plain.toString("utf8")).toBe(LOGIN);
    // The old record's bytes are gone from the file that held them (the hard-linked copy).
    const copied = fs.readFileSync(copy);
    expect(copied.length).toBe(oldBytes.length);
    expect(copied.equals(oldBytes)).toBe(false);
    expect(copied.toString("latin1")).not.toContain('"kind"');
    // Once only.
    expect(
      await migrateLegacyLoginSeal({ sealedFile, keys: k1, deviceBound: true, label }),
    ).toEqual({ ok: true, migrated: false });

    // An audit sink that throws: the move stands, and the adapter is told.
    fs.rmSync(sealedFile);
    fs.writeFileSync(plainFile, LOGIN, { mode: 0o600 });
    sealLoginFile({ plainFile, sealedFile, keys: legacy, deviceBound: true, label });
    const broken = await migrateLegacyLoginSeal({
      sealedFile,
      keys: k1,
      deviceBound: true,
      label,
      audit: async () => {
        throw new Error("log is full");
      },
    });
    expect(broken).toMatchObject({ ok: false, code: "audit-failed" });

    // A device on firmware before 0.5 keeps the CHALLENGE key and says what that leaves open ...
    forgetLaunchCredentialKeys();
    const old = standInDevice(28);
    const oc = await client((await owner(old)).path);
    const k4 = await credentialStoreKeys({
      keyFile,
      device: keyDevice(old, oc.remote),
      keyring: null,
    });
    expect(k4.device).toMatchObject({ derivation: "challenge", residual: KEY_DERIVE_RESIDUAL });
    expect(k4.write.source).toBe("device");
    // ... but never when the hardware root is required.
    const before = old.st.challenges;
    const k5 = await credentialStoreKeys({
      keyFile,
      device: keyDevice(old, oc.remote),
      keyring: null,
      rootRequired: true,
    });
    expect(k5.device).toMatchObject({ derivation: null });
    expect(k5.device?.problem).toMatch(/required/);
    expect(k5.write.source).not.toBe("device");
    expect(old.st.challenges).toBe(before);
  });
});
