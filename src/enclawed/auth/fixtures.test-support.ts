// Test-only builders: a small CBOR encoder, COSE keys and authenticator data
// signed with node:crypto keys, and a transport test double that answers the
// gate's libfido2 calls with those signatures. The double exists to exercise
// the gate's policy (enrollment, counters, tickets, auditing, refusals); it is
// not a model of any authenticator, and nothing here is evidence of how a
// real security key behaves. Live behavior is checked with real keys
// (scripts/enclawed/auth-live-test.sh).

import {
  type KeyObject,
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  sign as cryptoSign,
} from "node:crypto";
import type { Fido2DeviceInfo, Fido2Transport, GotAssertion, MadeCredential } from "./libfido2.js";
import { TEST_AAGUID, TEST_LEAF_KEY_JWK, TEST_LEAF_PEM } from "./vectors.test-support.js";

type Enc = number | Uint8Array | string | boolean | Enc[] | Map<number | string, Enc>;

function head(major: number, n: number): Uint8Array {
  if (n < 24) {
    return Uint8Array.of((major << 5) | n);
  }
  if (n < 0x100) {
    return Uint8Array.of((major << 5) | 24, n);
  }
  if (n < 0x10000) {
    return Uint8Array.of((major << 5) | 25, n >> 8, n & 0xff);
  }
  return Uint8Array.of(
    (major << 5) | 26,
    (n >>> 24) & 0xff,
    (n >> 16) & 0xff,
    (n >> 8) & 0xff,
    n & 0xff,
  );
}

export function cborEncode(v: Enc): Uint8Array {
  if (typeof v === "number") {
    return v >= 0 ? head(0, v) : head(1, -1 - v);
  }
  if (typeof v === "boolean") {
    return Uint8Array.of(v ? 0xf5 : 0xf4);
  }
  if (typeof v === "string") {
    const b = Buffer.from(v, "utf8");
    return Buffer.concat([head(3, b.length), b]);
  }
  if (v instanceof Uint8Array) {
    return Buffer.concat([head(2, v.length), v]);
  }
  if (Array.isArray(v)) {
    return Buffer.concat([head(4, v.length), ...v.map(cborEncode)]);
  }
  const parts: Uint8Array[] = [head(5, v.size)];
  for (const [k, val] of v) {
    parts.push(cborEncode(k), cborEncode(val));
  }
  return Buffer.concat(parts);
}

export function coseFor(publicKey: KeyObject): Uint8Array {
  const jwk = publicKey.export({ format: "jwk" });
  if (jwk.kty === "EC") {
    return cborEncode(
      new Map<number, Enc>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, Buffer.from(jwk.x!, "base64url")],
        [-3, Buffer.from(jwk.y!, "base64url")],
      ]),
    );
  }
  return cborEncode(
    new Map<number, Enc>([
      [1, 1],
      [3, -8],
      [-1, 6],
      [-2, Buffer.from(jwk.x!, "base64url")],
    ]),
  );
}

export const FLAGS = { UP: 0x01, UV: 0x04, BE: 0x08, BS: 0x10, AT: 0x40, ED: 0x80 } as const;

export function authData(p: {
  rpId: string;
  flags: number;
  signCount: number;
  attested?: { aaguid: string; credentialId: Uint8Array; cose: Uint8Array };
}): Uint8Array {
  const rpIdHash = createHash("sha256").update(p.rpId).digest();
  const counter = Buffer.alloc(4);
  counter.writeUInt32BE(p.signCount >>> 0);
  const parts: Uint8Array[] = [rpIdHash, Uint8Array.of(p.flags), counter];
  if (p.attested) {
    const len = Buffer.alloc(2);
    len.writeUInt16BE(p.attested.credentialId.length);
    parts.push(
      Buffer.from(p.attested.aaguid.replace(/-/g, ""), "hex"),
      len,
      p.attested.credentialId,
      p.attested.cose,
    );
  }
  return Buffer.concat(parts);
}

export function signWith(privateKey: KeyObject, data: Uint8Array): Uint8Array {
  const type = privateKey.asymmetricKeyType;
  return new Uint8Array(
    type === "ed25519"
      ? cryptoSign(null, data, privateKey)
      : cryptoSign("sha256", data, privateKey),
  );
}

export function newCredentialKey(alg: "es256" | "eddsa"): {
  privateKey: KeyObject;
  publicKey: KeyObject;
} {
  return alg === "es256"
    ? generateKeyPairSync("ec", { namedCurve: "P-256" })
    : generateKeyPairSync("ed25519");
}

export const testLeafKey = (): KeyObject =>
  createPrivateKey({ key: TEST_LEAF_KEY_JWK, format: "jwk" });
export const testLeafDer = (): Uint8Array => {
  const b64 = TEST_LEAF_PEM.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return new Uint8Array(Buffer.from(b64, "base64"));
};

type HeldCredential = { id: Uint8Array; rpId: string; privateKey: KeyObject; counter: number };

export type DoubleOptions = {
  path?: string;
  options?: Record<string, boolean>;
  flags?: number;
  /** Counter increment per assertion (0 = never counts). */
  counterStep?: number;
  versions?: string[];
};

/** A transport test double holding software keys (see the file header). */
export class TransportDouble implements Fido2Transport {
  readonly held: HeldCredential[] = [];
  plugged = true;
  readonly calls: string[] = [];
  /** Corrupt the next assertion's signature. */
  corruptNext = false;
  /** Report this counter on the next assertion instead of the incremented one. */
  forceCounter: number | null = null;

  constructor(readonly opts: DoubleOptions = {}) {}

  get info(): Fido2DeviceInfo {
    return {
      path: this.opts.path ?? "/dev/hidraw-test",
      description: "transport test double",
      options: new Map(
        Object.entries(this.opts.options ?? { rk: true, up: true, plat: false, clientPin: true }),
      ),
      aaguid: TEST_AAGUID,
      algorithms: ["es256", "eddsa"],
      versions: this.opts.versions ?? ["U2F_V2", "FIDO_2_0", "FIDO_2_1"],
    };
  }

  listDevices(): Fido2DeviceInfo[] {
    this.calls.push("list");
    return this.plugged ? [this.info] : [];
  }

  makeCredential(p: Parameters<Fido2Transport["makeCredential"]>[0]): MadeCredential {
    this.calls.push("make");
    const key = newCredentialKey(p.alg);
    const id = new Uint8Array(createHash("sha256").update(String(Math.random())).digest());
    const raw = authData({
      rpId: p.rpId,
      flags: (this.opts.flags ?? FLAGS.UP | FLAGS.UV) | FLAGS.AT,
      signCount: 0,
      attested: { aaguid: TEST_AAGUID, credentialId: id, cose: coseFor(key.publicKey) },
    });
    this.held.push({ id, rpId: p.rpId, privateKey: key.privateKey, counter: 0 });
    const sig = signWith(testLeafKey(), Buffer.concat([raw, p.clientDataHash]));
    return {
      clientDataHash: p.clientDataHash,
      rpId: p.rpId,
      fmt: "packed",
      authDataCbor: cborEncode(raw),
      credentialId: id,
      sig,
      x5c: [testLeafDer()],
    };
  }

  hasCredential(p: { rpId: string; credentialId: Uint8Array }): boolean {
    this.calls.push("probe");
    return this.held.some(
      (h) =>
        h.rpId === p.rpId && Buffer.compare(Buffer.from(h.id), Buffer.from(p.credentialId)) === 0,
    );
  }

  getAssertion(p: Parameters<Fido2Transport["getAssertion"]>[0]): GotAssertion {
    this.calls.push("assert");
    const h = this.held.find(
      (x) => Buffer.compare(Buffer.from(x.id), Buffer.from(p.credentialId)) === 0,
    );
    if (!h) {
      throw new Error("no such credential");
    }
    h.counter += this.opts.counterStep ?? 1;
    const counter = this.forceCounter ?? h.counter;
    this.forceCounter = null;
    const raw = authData({
      rpId: p.rpId,
      flags: this.opts.flags ?? FLAGS.UP | FLAGS.UV,
      signCount: counter,
    });
    const sig = signWith(h.privateKey, Buffer.concat([raw, p.clientDataHash]));
    if (this.corruptNext) {
      sig[sig.length - 1] ^= 0xff;
      this.corruptNext = false;
    }
    return { clientDataHash: p.clientDataHash, rpId: p.rpId, authDataCbor: cborEncode(raw), sig };
  }
}
