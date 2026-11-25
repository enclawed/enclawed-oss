// The command set 0.5 stand-in device for host-protocol tests (no real device): signs with a
// software key exactly the structures the Enclaweder host protocol specifies ("Command set
// 0.5": the bound anchor session and record v3, ANCHOR_READ, UNLOCK_USE, KEY_DERIVE over a seal)
// and keeps what the device keeps. Shared by cs05.test.ts and anchor-history.test.ts.
import {
  createHash,
  createHmac,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  type KeyObject,
  randomBytes,
  sign as edSign,
} from "node:crypto";
import { spendUnlock } from "./device-factors.js";
import { AnchorSession, parseAnchor } from "./enclaweder-hid.js";

const H = (s: string) => Buffer.from(s, "hex");
const L = (s: string) => Buffer.from(s, "latin1");
const le16 = (v: number) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(v);
  return b;
};
const le64 = (v: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(v);
  return b;
};
const sha3 = (b: Buffer) => createHash("sha3-256").update(b).digest();

// ---- (2) the stand-in device -------------------------------------------------------------------
const X_SPKI = H("302a300506032b656e032100");
type Act = { bind: Buffer; anchor: boolean; key: boolean };

/**
 * Signs the structures this host verifies and keeps what the device keeps: the counter, open
 * count, the head's session and binding, one session (plain or bound), the activations (by
 * request nonce), and seals. `cs04` answers as firmware before command set 0.5 does.
 */
export class StandIn {
  readonly key: KeyObject;
  readonly raw: Buffer;
  readonly uid = randomBytes(12);
  cs04 = false;
  counter = 0n;
  opens = 0n;
  head = Buffer.alloc(32);
  headSess = 0n;
  session: { sid: bigint; bind: Buffer | null } | null = null;
  readonly acts = new Map<string, Act>();
  readonly seals = new Map<string, { kEnc: Buffer; kMac: Buffer }>();
  gid = 7n;
  useIndex = 0;
  boot = 3n;
  sealSeq = 0n;
  constructor() {
    const k = generateKeyPairSync("ed25519");
    this.key = k.privateKey;
    this.raw = Buffer.from((k.publicKey.export({ format: "jwk" }) as { x: string }).x, "base64url");
  }
  sign(m: Buffer): Buffer {
    return edSign(null, m, this.key);
  }
  /** A frame device for AnchorSession / spendUnlock. */
  frames() {
    return {
      request: async (type: number, _id: number, payload = Buffer.alloc(0)) => ({
        payload: this.answer(type, payload),
      }),
    };
  }
  open(payload: Buffer, bind: Buffer | null): Buffer {
    const hostPub = payload.subarray(0, 32);
    const hostNonce = payload.subarray(32, 48);
    const devPub = Buffer.from(
      generateKeyPairSync("x25519").publicKey.export({ format: "der", type: "spki" }).subarray(12),
    );
    const devNonce = randomBytes(16);
    this.opens += 1n;
    this.session = { sid: this.opens, bind };
    const t = Buffer.concat([
      bind ? L("enclaweder.anchor-open-bound.v1") : L("ECW-ANCHOR-OPN-1"),
      this.uid,
      le64(this.opens),
      le64(this.counter),
      hostPub,
      devPub,
      hostNonce,
      devNonce,
      ...(bind ? [bind] : []),
    ]);
    return Buffer.concat([
      Buffer.from([0]),
      le64(this.opens),
      le64(this.counter),
      devPub,
      devNonce,
      this.uid,
      ...(bind ? [bind] : []),
      this.sign(t),
    ]);
  }
  record(): Buffer {
    const bind = this.session?.sid === this.headSess ? this.session.bind : null;
    const body = Buffer.concat([
      le64(this.counter),
      this.head,
      this.uid,
      le64(this.headSess),
      le64(this.opens),
    ]);
    if (bind) {
      const sig = this.sign(Buffer.concat([L("enclaweder.anchor-record.v3"), body, bind]));
      return Buffer.concat([Buffer.from([0, 3]), body, bind, sig]);
    }
    const sig = this.sign(Buffer.concat([L("ECW-ANCHOR-02\0\0\0"), body]));
    return Buffer.concat([Buffer.from([0, 2]), body, sig]);
  }
  read(nonce: Buffer): Buffer {
    const live = this.session !== null;
    const lb = this.session?.bind ?? null;
    const body = Buffer.alloc(112);
    body[0] = 1;
    body[1] =
      (this.counter > 0n ? 1 : 0) |
      (live ? 2 : 0) |
      (lb ? 4 : 0) |
      (live && this.counter > 0n && this.headSess === this.session?.sid ? 8 : 0);
    body.writeBigUInt64LE(this.counter, 4);
    this.head.copy(body, 12);
    this.uid.copy(body, 44);
    body.writeBigUInt64LE(this.headSess, 56);
    body.writeBigUInt64LE(this.opens, 64);
    body.writeBigUInt64LE(this.session?.sid ?? 0n, 72);
    lb?.copy(body, 80);
    return Buffer.concat([
      Buffer.from([0]),
      body,
      this.sign(Buffer.concat([L("enclaweder.anchor-read.v1"), nonce, body])),
    ]);
  }
  use(payload: Buffer): Buffer {
    const nonce = payload.subarray(0, 32);
    this.useIndex += 1;
    const b = Buffer.alloc(100);
    b[0] = 1;
    b[1] = 1;
    b[3] = 2;
    b.writeUInt16LE(10, 4);
    b.writeUInt16LE(this.useIndex, 6);
    b.writeBigUInt64LE(payload.readBigUInt64LE(32), 8);
    b.writeBigUInt64LE(this.boot, 16);
    b.writeBigUInt64LE(payload.readBigUInt64LE(40), 40);
    b.writeUInt32LE(59_999_999, 48);
    b.writeUInt16LE(this.useIndex, 52);
    this.uid.copy(b, 56);
    payload.subarray(48, 80).copy(b, 68);
    const bind = Buffer.alloc(32);
    bind[0] = 1;
    b.copy(bind, 2, 52, 54);
    b.copy(bind, 4, 48, 52);
    b.copy(bind, 8, 8, 16);
    b.copy(bind, 16, 16, 24);
    this.acts.set(nonce.toString("hex"), { bind, anchor: false, key: false });
    return Buffer.concat([
      Buffer.from([0]),
      b,
      this.sign(Buffer.concat([L("enclaweder.unlock-use.v1"), nonce, b])),
    ]);
  }
  boundOpen(payload: Buffer): Buffer {
    if (this.cs04) {
      return Buffer.from([8]);
    }
    const a = this.acts.get(payload.subarray(48, 80).toString("hex"));
    if (this.session?.bind) {
      return Buffer.from([7, 0x10, 0x27, 0, 0]);
    }
    if (!a || a.anchor) {
      return Buffer.from([5]);
    }
    a.anchor = true;
    return this.open(payload, a.bind);
  }
  keyDerive(pt: Buffer, s: { id: bigint; kEnc: Buffer; kMac: Buffer }): Buffer {
    const a = this.acts.get(pt.subarray(0, 32).toString("hex"));
    if (!a || a.key) {
      return Buffer.from([5]);
    }
    a.key = true;
    const out = sha3(
      this.sign(Buffer.concat([L("enclaweder.key-derive.v1"), this.uid, pt.subarray(32, 64)])),
    );
    const ks = createHmac("sha3-256", s.kEnc)
      .update(Buffer.concat([L("ECW-SEAL-RSTR-01"), Buffer.from([0])]))
      .digest();
    const ct = Buffer.from(out.map((x, i) => x ^ ks[i]));
    const tag = createHmac("sha3-256", s.kMac)
      .update(
        Buffer.concat([
          L("ECW-SEAL-RMAC-01"),
          this.uid,
          le64(s.id),
          Buffer.from([0x39]),
          a.bind,
          ct,
        ]),
      )
      .digest();
    return Buffer.concat([Buffer.from([0]), a.bind, ct, tag]);
  }
  sealOpen(payload: Buffer): Buffer {
    const cp = payload.subarray(0, 32);
    const cn = payload.subarray(32, 48);
    const eph = generateKeyPairSync("x25519");
    const dp = Buffer.from(eph.publicKey.export({ format: "der", type: "spki" }).subarray(12));
    const dn = randomBytes(16);
    const id = ++this.sealSeq;
    const shared = diffieHellman({
      privateKey: eph.privateKey,
      publicKey: createPublicKey({ key: Buffer.concat([X_SPKI, cp]), format: "der", type: "spki" }),
    });
    const salt = Buffer.concat([cn, dn]);
    const tail = Buffer.concat([this.uid, le64(id), cp, dp]);
    const kd = (tag: string) =>
      Buffer.from(hkdfSync("sha3-256", shared, salt, Buffer.concat([L(tag), tail]), 32));
    this.seals.set(id.toString(), { kEnc: kd("ECW-SEAL-KENC-01"), kMac: kd("ECW-SEAL-KMAC-01") });
    const sig = this.sign(
      Buffer.concat([L("ECW-SEAL-OPEN-01"), this.uid, le64(id), cp, dp, cn, dn]),
    );
    return Buffer.concat([Buffer.from([0]), le64(id), dp, dn, this.uid, sig]);
  }
  sealed(frame: Buffer): Buffer {
    const id = frame.readBigUInt64LE(0);
    const op = frame[8];
    const n = frame.readUInt16LE(9);
    const ct = frame.subarray(11, 11 + n);
    const s = this.seals.get(id.toString());
    this.seals.delete(id.toString());
    if (!s) {
      return Buffer.from([5]);
    }
    const tag = createHmac("sha3-256", s.kMac)
      .update(
        Buffer.concat([L("ECW-SEAL-MACT-01"), this.uid, le64(id), Buffer.from([op]), le16(n), ct]),
      )
      .digest();
    if (!tag.equals(frame.subarray(11 + n, 11 + n + 32))) {
      return Buffer.from([5]);
    }
    const pt = Buffer.from(ct);
    for (let off = 0, i = 0; off < n; off += 32, i++) {
      const ks = createHmac("sha3-256", s.kEnc)
        .update(Buffer.concat([L("ECW-SEAL-KSTR-01"), Buffer.from([i])]))
        .digest();
      for (let j = 0; j < 32 && off + j < n; j++) {
        pt[off + j] ^= ks[j];
      }
    }
    if (this.cs04 && (op === 0x31 || op === 0x37 || op === 0x39)) {
      return Buffer.from([1]);
    }
    if (op === 0x37) {
      return this.boundOpen(pt);
    }
    if (op === 0x31) {
      return this.use(pt);
    }
    if (op === 0x39) {
      return this.keyDerive(pt, { id, ...s });
    }
    return Buffer.from([1]);
  }
  answer(type: number, payload: Buffer): Buffer {
    switch (type) {
      case 0x19:
        if (this.session) {
          return Buffer.from([7, 0x10, 0x27, 0, 0]);
        }
        return this.open(payload, null);
      case 0x37:
        return this.boundOpen(payload);
      case 0x17:
        this.counter += 1n;
        this.head = Buffer.from(payload.subarray(0, 32));
        this.headSess = payload.readBigUInt64LE(32);
        return this.record();
      case 0x1b: {
        const b = Buffer.alloc(5);
        b.writeUInt32LE(120_000, 1);
        return b;
      }
      case 0x1a:
        this.session = null;
        return Buffer.from([0]);
      case 0x38:
        return this.cs04 ? Buffer.from([8]) : this.read(payload);
      case 0x31:
        return this.use(payload);
      case 0x35:
        return this.sealOpen(payload);
      case 0x36:
        return this.sealed(payload);
      default:
        return Buffer.from([8]);
    }
  }
}

/** A direct device as head-anchor drives it (the Enclaweder methods, over the stand-in). */
export function direct(dev: StandIn) {
  const frames = dev.frames();
  return {
    anchorOpen: (pub: Buffer) => AnchorSession.open(frames, pub),
    anchorOpenBound: (pub: Buffer, nonce: Buffer) => AnchorSession.openBound(frames, pub, nonce),
    anchorRead: async (n: Buffer) => dev.answer(0x38, n),
    anchorGet: async () => parseAnchor(dev.record()),
  };
}

/** The launch's activation: one counted use, through the host's own spendUnlock. */
export async function activate(dev: StandIn) {
  const nonce = randomBytes(32);
  const r = await spendUnlock(dev.frames(), dev.raw, dev.uid, {
    gid: dev.gid,
    scope: randomBytes(32),
    nonce,
  });
  if (!r.ok) {
    throw new Error(`spend: ${r.code}`);
  }
  return { nonce, receipt: r.receipt };
}
export const unlockRecord = (gid: bigint, useIndex: number) => ({
  type: "codenclawed.auth.device-factor",
  payload: {
    purpose: "session-start",
    outcome: "verified",
    via: "device-unlock",
    gid: gid.toString(),
    useIndex,
  },
});
