// TypeScript port of the enclaweder USB-HID driver (raw /dev/hidraw, no native deps). Vendored from
// enclaweder/integration/enclawed/enclaweder-hid.mjs -- keep in sync with that source of truth.
// Wire protocol: SOF(0xE2) VER TYPE ID(2,LE) LEN(2,LE) payload CRC16-CCITT-FALSE(2,LE), carried as
// 64-byte HID reports. This is the enclawed<->enclaweder seam.
import { createPublicKey, verify as edVerify, createHash } from "node:crypto";
import fs from "node:fs";

const CHALLENGE_TAG = Buffer.from("ECW-CHALLENGE-01"); // must match firmware/core/dispatch.c

export interface Identity {
  uid: Buffer;
  serial: string;
  pubkeyRaw: Buffer;
  flags: number;
}
export interface DeviceStatus {
  state: number;
  gate: number;
  k: number;
  n: number;
  nodesOnline: number;
  ledger: number;
  locked: number;
}
export interface ChallengeResponse {
  uid: Buffer;
  sig: Buffer;
}

/** Auto-detect a connected enclaweder by its USB VID:PID (1209:E100) via sysfs. Returns the
 *  /dev/hidraw* path or null. Used at enclawed bootstrap: if a device is found, it is mandatory. */
export function findAllEnclaweders(): string[] {
  const found: string[] = [];
  try {
    for (const hd of fs.readdirSync("/sys/class/hidraw")) {
      try {
        const u = fs.readFileSync(`/sys/class/hidraw/${hd}/device/uevent`, "utf8").toUpperCase();
        if (u.includes("00001209") && u.includes("0000E100")) {
          found.push(`/dev/${hd}`);
        }
      } catch {
        /* unreadable node -- skip */
      }
    }
  } catch {
    /* no hidraw subsystem (e.g. macOS/Windows) */
  }
  // Deterministic order so a fleet's member indices are stable across boots on the same host.
  // hidraw numbering is assigned in enumeration order, so sort numerically, not lexically
  // (/dev/hidraw10 must not sort before /dev/hidraw2).
  return found.toSorted((a, b) => {
    const na = Number(a.replace(/\D+/g, ""));
    const nb = Number(b.replace(/\D+/g, ""));
    return na - nb;
  });
}

/** First detected device, or null. Equivalent to findAllEnclaweders()[0]. */
export function findEnclaweder(): string | null {
  return findAllEnclaweders()[0] ?? null;
}

/** raw Ed25519 public key (32 bytes) -> SPKI PEM (so Node crypto + enclawed can use it). */
export function rawEd25519ToPem(raw32: Buffer): string {
  const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(raw32)]);
  return createPublicKey({ key: der, format: "der", type: "spki" }).export({
    format: "pem",
    type: "spki",
  });
}

/** Verify a proof-of-possession challenge response against the device's raw public key. */
export function verifyChallenge(
  pubkeyRaw: Buffer,
  nonce32: Buffer,
  uid12: Buffer,
  sig64: Buffer,
): boolean {
  const pub = createPublicKey(rawEd25519ToPem(pubkeyRaw));
  const msg = Buffer.concat([CHALLENGE_TAG, Buffer.from(nonce32), Buffer.from(uid12)]);
  try {
    return edVerify(null, msg, pub, sig64);
  } catch {
    return false;
  }
}

/** Pinned manufacturer root public key (Ed25519, raw 32B). PUBLIC -- safe to embed. This is the trust
 *  anchor: a genuine enclaweder carries a birth certificate signed by the matching root PRIVATE key
 *  (kept offline). Its root_id (first 4B of SHA-256) is 5cc8040c. Mirrors provisioning/root_pub.hex;
 *  override via the guard only for testing or a different manufacturer root. */
export const ENCLAWEDER_ROOT_PUBKEY = Buffer.from(
  "8b7d01806542104d3ef9560c644297bd4f07279e646fe33da9a072f4fc5f6694",
  "hex",
);

/** Enclaweder Pro manufacturer root. Pro is a SEPARATE TRUST DOMAIN, not a flag on the base line:
 *  base and Pro are the same silicon and differ only in firmware and in which root signed the unit,
 *  so the authenticated model field -- never the USB serial prefix -- is the thing to gate on.
 *  Mirrors provisioning/pro/root_pub_pro.hex. */
export const ENCLAWEDER_ROOT_PUBKEY_PRO = Buffer.from(
  "d41d18029a04b9e69afd2c689c86eaf54f9dccd2e1adade684f0dfbd421daf8d",
  "hex",
);

export type EnclawederSku = "base" | "pro";

/** The pinned trust domains. `model` is the ONLY model each root is permitted to have issued, so a
 *  cert claiming model=2 while signed by the base root is rejected even though its signature is
 *  valid -- that combination is exactly the "base unit presented as Pro" forgery the separate-domain
 *  design exists to stop. */
export const ENCLAWEDER_DOMAINS: Array<{
  name: EnclawederSku;
  model: number;
  pub: Buffer;
}> = [
  { name: "base", model: 1, pub: ENCLAWEDER_ROOT_PUBKEY },
  { name: "pro", model: 2, pub: ENCLAWEDER_ROOT_PUBKEY_PRO },
];

export interface DeviceCert {
  ver: number;
  uid: Buffer;
  devicePub: Buffer;
  model: number;
  date: number;
  rootId: Buffer;
  /** Which pinned domain signed this cert. Authenticated -- unlike the USB serial prefix. */
  sku?: EnclawederSku;
}

/** 4-byte key id = first 4 bytes of SHA-256(root pubkey). Mirrors provisioning/cert.py root_id(). */
function certRootId(rootPubRaw: Buffer): Buffer {
  return createHash("sha256").update(rootPubRaw).digest().subarray(0, 4);
}

/**
 * Verify a device birth certificate (119B; layout in provisioning/cert.py) and bind it to a device:
 * it must (a) chain to the pinned manufacturer root, and (b) certify THIS exact device's uid + key.
 * Returns the parsed cert, or null if anything fails. Requiring this at bind time turns "a device is
 * present" into "a MANUFACTURER-CERTIFIED device is present": a zeroized/re-minted or counterfeit unit
 * passes challenge-response (it holds its own key) but has no root-signed cert for that key.
 */
export function verifyCert(
  cert: Buffer,
  deviceUid: Buffer,
  devicePubRaw: Buffer,
  rootPubRaw: Buffer | null = null,
): DeviceCert | null {
  const CERT_SIGNED_LEN = 55;
  const CERT_LEN = 119;
  if (cert.length !== CERT_LEN || cert[0] !== 1) {
    return null;
  }
  const parsed: DeviceCert = {
    ver: cert[0],
    uid: Buffer.from(cert.subarray(1, 13)),
    devicePub: Buffer.from(cert.subarray(13, 45)),
    model: cert[45] | (cert[46] << 8),
    date: (cert[47] | (cert[48] << 8) | (cert[49] << 16) | (cert[50] << 24)) >>> 0,
    rootId: Buffer.from(cert.subarray(51, 55)),
  };
  // rootPubRaw null  -> accept any PINNED domain, choosing the anchor by the cert's own root_id.
  // rootPubRaw given -> demand that exact root (used by tests and to require one SKU).
  // Selecting by root_id weakens nothing: the anchor must still be pinned, the signature must
  // verify under it, and the model must be one that domain is allowed to issue.
  const domain = rootPubRaw
    ? (ENCLAWEDER_DOMAINS.find((dm) => dm.pub.equals(rootPubRaw)) ?? {
        name: (parsed.model === 2 ? "pro" : "base") as EnclawederSku,
        model: null as number | null,
        pub: rootPubRaw,
      })
    : ENCLAWEDER_DOMAINS.find((dm) => parsed.rootId.equals(certRootId(dm.pub)));
  if (!domain) {
    return null; // root_id matches no pinned manufacturer root
  }
  if (!parsed.rootId.equals(certRootId(domain.pub))) {
    return null; // signed by a different (or no) root
  }
  if (domain.model !== null && parsed.model !== domain.model) {
    return null; // model does not belong to the root that signed it
  }
  parsed.sku = domain.name;
  if (!parsed.uid.equals(deviceUid) || !parsed.devicePub.equals(devicePubRaw)) {
    return null; // certifies a different device
  }
  try {
    const pub = createPublicKey(rawEd25519ToPem(domain.pub));
    if (
      !edVerify(
        null,
        cert.subarray(0, CERT_SIGNED_LEN),
        pub,
        cert.subarray(CERT_SIGNED_LEN, CERT_LEN),
      )
    ) {
      return null; // signature forged/invalid
    }
  } catch {
    return null;
  }
  return parsed;
}

const T = {
  GET_STATUS: 0x02,
  GET_IDENTITY: 0x0d,
  GET_CERT: 0x0f,
  CHALLENGE: 0x11,
} as const;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function crc16(buf: Buffer): number {
  let crc = 0xffff;
  for (const b of buf) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}
function encode(type: number, id: number, payload: Buffer = Buffer.alloc(0)): Buffer {
  const body = Buffer.from([
    0x01,
    type,
    id & 0xff,
    id >> 8,
    payload.length & 0xff,
    payload.length >> 8,
  ]);
  const b = Buffer.concat([body, payload]);
  const c = crc16(b);
  return Buffer.concat([Buffer.from([0xe2]), b, Buffer.from([c & 0xff, c >> 8])]);
}

interface Frame {
  type: number;
  id: number;
  payload: Buffer;
}

export const ACC_STATE = {
  BOOT: 0,
  SELFTEST: 1,
  PROVISION: 2,
  READY: 3,
  ATTESTED: 4,
  ZEROIZED: 5,
  FAULT: 6,
} as const;

export class Enclaweder {
  private fd: number;
  private buf: Buffer;
  private mid = 0; // per-device request counter; see request()
  constructor(path = "/dev/hidraw0") {
    this.fd = fs.openSync(path, fs.constants.O_RDWR | fs.constants.O_NONBLOCK);
    this.buf = Buffer.alloc(0);
  }
  close(): void {
    try {
      fs.closeSync(this.fd);
    } catch {
      /* already closed */
    }
  }
  private writeFrame(frame: Buffer): void {
    for (let off = 0; off < frame.length; off += 64) {
      const chunk = frame.subarray(off, off + 64);
      const rep = Buffer.alloc(65); // report id 0 + 64-byte report
      chunk.copy(rep, 1);
      fs.writeSync(this.fd, rep);
    }
  }
  private tryParse(): Frame | null {
    let b = this.buf;
    let i = 0;
    while (i < b.length && b[i] !== 0xe2) {
      i++;
    }
    if (i) {
      b = b.subarray(i);
      this.buf = b;
    }
    if (b.length < 9) {
      return null;
    }
    const len = b[5] | (b[6] << 8);
    if (b.length < 9 + len) {
      return null;
    }
    const type = b[2];
    const id = b[3] | (b[4] << 8);
    const payload = Buffer.from(b.subarray(7, 7 + len));
    const crcRx = b[7 + len] | (b[8 + len] << 8);
    const ok = crc16(b.subarray(1, 7 + len)) === crcRx;
    this.buf = Buffer.from(b.subarray(9 + len));
    return ok ? { type, id, payload } : null;
  }
  /** Monotonic message id. The wire id is a u16 (proto.c), so wrap at 0xffff and skip 0. */
  private nextId(): number {
    this.mid = (this.mid % 0xffff) + 1;
    return this.mid;
  }

  /**
   * Send one request and return ONLY its own response.
   *
   * This used to match on TYPE ALONE while every caller passed a hard-coded id, so two successive
   * challenge() calls were indistinguishable on the wire: if one timed out, its late response could
   * be handed to the NEXT request. For challenge that is not a benign glitch -- the caller verifies
   * the signature against the nonce IT sent, so a stale response is reported as a BAD SIGNATURE,
   * i.e. the tooling accuses genuine hardware of being counterfeit. Matters more with a fleet,
   * where several devices are driven concurrently.
   */
  async request(
    type: number,
    _idIgnored: number,
    payload: Buffer = Buffer.alloc(0),
    timeoutMs = 3000,
  ): Promise<Frame | null> {
    const id = this.nextId();
    this.buf = Buffer.alloc(0); // drop any late response to an earlier request
    this.writeFrame(encode(type, id, payload));
    const want = type | 0x80;
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const f = this.tryParse();
      if (f) {
        if (f.type === want && f.id === id) {
          return f;
        } else {
          continue;
        } // skip unsolicited events and stale frames
      }
      try {
        const tmp = Buffer.alloc(64);
        const n = fs.readSync(this.fd, tmp, 0, 64, null);
        if (n > 0) {
          this.buf = Buffer.concat([this.buf, tmp.subarray(0, n)]);
        }
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "EAGAIN") {
          await sleep(2);
        } else {
          throw e;
        }
      }
    }
    return null;
  }

  // ---- high-level ops used by the hardware-root guard ----
  async getIdentity(): Promise<Identity> {
    const f = await this.request(T.GET_IDENTITY, 1);
    if (!f) {
      throw new Error("GET_IDENTITY: no response");
    }
    const p = f.payload;
    const uid = Buffer.from(p.subarray(1, 13));
    return {
      uid,
      serial: "ENCLW-" + uid.toString("hex").toUpperCase(),
      pubkeyRaw: Buffer.from(p.subarray(13, 45)),
      flags: p[45],
    };
  }
  async getStatus(): Promise<DeviceStatus> {
    const f = await this.request(T.GET_STATUS, 1);
    if (!f) {
      throw new Error("GET_STATUS: no response");
    }
    const p = f.payload;
    return {
      state: p[1],
      gate: p[2],
      k: p[3],
      n: p[4],
      nodesOnline: p[6],
      ledger: p[12] | (p[13] << 8) | (p[14] << 16) | (p[15] << 24),
      locked: p[16],
    };
  }
  /** Proof-of-possession: the device signs tag||nonce||uid with its private key. */
  async challenge(nonce32: Buffer): Promise<ChallengeResponse> {
    const f = await this.request(T.CHALLENGE, 1, Buffer.from(nonce32));
    if (!f || f.payload[0] !== 0) {
      throw new Error("CHALLENGE: rejected");
    }
    const p = f.payload;
    return {
      uid: Buffer.from(p.subarray(1, 13)),
      sig: Buffer.from(p.subarray(13, 77)),
    };
  }
  /** Fetch the on-device birth certificate (opaque 119B blob). null if the device has none. */
  async getCert(): Promise<Buffer | null> {
    const f = await this.request(T.GET_CERT, 1);
    if (!f || f.payload.length < 3 || f.payload[0] !== 0) {
      return null;
    }
    const p = f.payload;
    const n = p[1] | (p[2] << 8);
    if (n <= 0 || p.length < 3 + n) {
      return null;
    }
    return Buffer.from(p.subarray(3, 3 + n));
  }
}
