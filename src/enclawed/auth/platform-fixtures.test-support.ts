// Test-only builders for platform attestation statements ("tpm", "apple",
// "android-key") in their real wire formats: a small DER encoder, X.509
// certificates signed with node:crypto keys under throwaway test roots, the
// TPM 2.0 structures (TPMT_PUBLIC, TPMS_ATTEST), Apple's nonce extension and
// Android's key description. Each builder takes switches that break exactly
// one property, for the verifier's negative cases. The statements are
// generated here; they make no claim about any vendor's behavior (the real
// captured statements are in platform-vectors.test-support.ts).

import {
  type KeyObject,
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign as cryptoSign,
} from "node:crypto";
import { FLAGS, authData, cborEncode } from "./fixtures.test-support.js";

// ─── DER ─────────────────────────────────────────────────────────────────

function len(n: number): Buffer {
  if (n < 0x80) {
    return Buffer.from([n]);
  }
  const bytes: number[] = [];
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n = Math.floor(n / 256);
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

export function tlv(tag: number | Buffer, content: Uint8Array): Buffer {
  const t = typeof tag === "number" ? Buffer.from([tag]) : tag;
  return Buffer.concat([t, len(content.length), content]);
}

export const derSeq = (...items: Uint8Array[]): Buffer => tlv(0x30, Buffer.concat(items));
export const derSet = (...items: Uint8Array[]): Buffer => tlv(0x31, Buffer.concat(items));
export const derOctets = (b: Uint8Array): Buffer => tlv(0x04, b);
export const derUtf8 = (s: string): Buffer => tlv(0x0c, Buffer.from(s, "utf8"));
export const derBool = (v: boolean): Buffer => tlv(0x01, Buffer.from([v ? 0xff : 0]));
export const derNull = (): Buffer => Buffer.from([0x05, 0x00]);

export function derInt(v: number | Uint8Array, tag = 0x02): Buffer {
  let b: Buffer;
  if (typeof v === "number") {
    const bytes: number[] = [];
    let n = v;
    do {
      bytes.unshift(n & 0xff);
      n = Math.floor(n / 256);
    } while (n > 0);
    b = Buffer.from(bytes);
  } else {
    b = Buffer.from(v);
    while (b.length > 1 && b[0] === 0) {
      b = b.subarray(1);
    }
  }
  if (b[0] & 0x80) {
    b = Buffer.concat([Buffer.from([0]), b]);
  }
  return tlv(tag, b);
}

export const derEnum = (v: number): Buffer => derInt(v, 0x0a);

export function derOid(oid: string): Buffer {
  const arcs = oid.split(".").map(Number);
  const out: number[] = [arcs[0] * 40 + arcs[1]];
  for (const a of arcs.slice(2)) {
    const enc: number[] = [a & 0x7f];
    let n = Math.floor(a / 128);
    while (n > 0) {
      enc.unshift((n & 0x7f) | 0x80);
      n = Math.floor(n / 128);
    }
    out.push(...enc);
  }
  return tlv(0x06, Buffer.from(out));
}

/** A context-specific EXPLICIT tag of any number (high-tag form above 30). */
export function derExplicit(tag: number, inner: Uint8Array): Buffer {
  if (tag < 31) {
    return tlv(0xa0 | tag, inner);
  }
  const enc: number[] = [tag & 0x7f];
  let n = Math.floor(tag / 128);
  while (n > 0) {
    enc.unshift((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  return tlv(Buffer.from([0xbf, ...enc]), inner);
}

function derTime(ms: number): Buffer {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  const s = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  return tlv(0x18, Buffer.from(s, "ascii"));
}

// ─── X.509 ───────────────────────────────────────────────────────────────

export type Ext = { oid: string; critical?: boolean; value: Uint8Array };

export function nameOf(cn: string): Buffer {
  return derSeq(derSet(derSeq(derOid("2.5.4.3"), derUtf8(cn))));
}

export const EMPTY_NAME = derSeq();

export type Issuer = { name: Buffer; key: KeyObject };

/** An X.509 v3 certificate, DER. */
export function buildCert(p: {
  subject: Buffer;
  publicKey: KeyObject;
  issuer: Issuer | "self";
  selfKey?: KeyObject;
  ca: boolean;
  notBefore?: number;
  notAfter?: number;
  extensions?: Ext[];
  version?: number;
}): Buffer {
  const issuerName = p.issuer === "self" ? p.subject : p.issuer.name;
  const signer = p.issuer === "self" ? p.selfKey! : p.issuer.key;
  const rsa = signer.asymmetricKeyType === "rsa";
  const sigAlg = rsa
    ? derSeq(derOid("1.2.840.113549.1.1.11"), derNull())
    : derSeq(derOid("1.2.840.10045.4.3.2"));
  const exts: Ext[] = [
    { oid: "2.5.29.19", critical: true, value: p.ca ? derSeq(derBool(true)) : derSeq() },
    ...(p.extensions ?? []),
  ];
  const extDer = derExplicit(
    3,
    derSeq(
      ...exts.map((e) =>
        derSeq(derOid(e.oid), ...(e.critical ? [derBool(true)] : []), derOctets(e.value)),
      ),
    ),
  );
  const tbs = derSeq(
    derExplicit(0, derInt(p.version ?? 2)),
    derInt(randomBytes(8)),
    sigAlg,
    issuerName,
    derSeq(
      derTime(p.notBefore ?? Date.UTC(2020, 0, 1)),
      derTime(p.notAfter ?? Date.UTC(2040, 0, 1)),
    ),
    p.subject,
    p.publicKey.export({ type: "spki", format: "der" }),
    extDer,
  );
  const sig = rsa
    ? cryptoSign("sha256", tbs, signer)
    : cryptoSign("sha256", tbs, { key: signer, dsaEncoding: "der" });
  return derSeq(tbs, sigAlg, tlv(0x03, Buffer.concat([Buffer.from([0]), sig])));
}

export type TestPki = {
  rootPem: string;
  root: Issuer;
  intermediate: Issuer;
  intermediateDer: Buffer;
};

/** A throwaway root and intermediate CA. */
export function newTestPki(kind: "ec" | "rsa" = "ec"): TestPki {
  const gen = () =>
    kind === "ec"
      ? generateKeyPairSync("ec", { namedCurve: "P-256" })
      : generateKeyPairSync("rsa", { modulusLength: 2048 });
  const rk = gen();
  const rootName = nameOf("Enclawed Test Attestation Root");
  const rootDer = buildCert({
    subject: rootName,
    publicKey: rk.publicKey,
    issuer: "self",
    selfKey: rk.privateKey,
    ca: true,
  });
  const ik = gen();
  const intName = nameOf("Enclawed Test Attestation Intermediate");
  const intermediateDer = buildCert({
    subject: intName,
    publicKey: ik.publicKey,
    issuer: { name: rootName, key: rk.privateKey },
    ca: true,
  });
  const rootPem = `-----BEGIN CERTIFICATE-----\n${rootDer.toString("base64").replace(/.{64}/g, "$&\n")}\n-----END CERTIFICATE-----\n`;
  return {
    rootPem,
    root: { name: rootName, key: rk.privateKey },
    intermediate: { name: intName, key: ik.privateKey },
    intermediateDer,
  };
}

// ─── COSE and registration data ──────────────────────────────────────────

type Enc = Parameters<typeof cborEncode>[0];

export function coseOf(publicKey: KeyObject): Uint8Array {
  const jwk = publicKey.export({ format: "jwk" });
  if (jwk.kty === "RSA") {
    return cborEncode(
      new Map<number, Enc>([
        [1, 3],
        [3, -257],
        [-1, Buffer.from(jwk.n!, "base64url")],
        [-2, Buffer.from(jwk.e!, "base64url")],
      ]),
    );
  }
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

export const PLATFORM_TEST_AAGUID = "08987058-cadc-4b81-b6e1-30de50dcbe96";

export type BuiltRegistration = {
  fmt: string;
  authDataRaw: Uint8Array;
  attestationObject: Uint8Array;
  credentialId: Uint8Array;
  credentialKey: KeyObject;
  clientDataHash: Uint8Array;
};

function regAuthData(p: {
  rpId: string;
  flags?: number;
  aaguid?: string;
  credentialId: Uint8Array;
  publicKey: KeyObject;
}): Uint8Array {
  return authData({
    rpId: p.rpId,
    flags: (p.flags ?? FLAGS.UP | FLAGS.UV) | FLAGS.AT,
    signCount: 0,
    attested: {
      aaguid: p.aaguid ?? PLATFORM_TEST_AAGUID,
      credentialId: p.credentialId,
      cose: coseOf(p.publicKey),
    },
  });
}

function attObj(fmt: string, auth: Uint8Array, stmt: Map<string, Enc>): Uint8Array {
  return cborEncode(
    new Map<string, Enc>([
      ["fmt", fmt],
      ["attStmt", stmt],
      ["authData", auth],
    ]),
  );
}

// ─── tpm ─────────────────────────────────────────────────────────────────

const u16 = (n: number) => Buffer.from([(n >> 8) & 0xff, n & 0xff]);
const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0);
  return b;
};
const tpm2b = (b: Uint8Array) => Buffer.concat([u16(b.length), b]);

export type TpmBreak =
  | "none"
  | "extra-data"
  | "attested-name"
  | "not-fixed-tpm"
  | "pubarea-other-key"
  | "magic"
  | "no-eku"
  | "subject-not-empty"
  | "no-san"
  | "aik-signature"
  | "aaguid-ext-mismatch";

export function buildTpmRegistration(p: {
  pki: TestPki;
  rpId: string;
  clientDataHash: Uint8Array;
  flags?: number;
  aaguid?: string;
  brk?: TpmBreak;
}): BuiltRegistration {
  const brk = p.brk ?? "none";
  const cred = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const credentialId = randomBytes(32);
  const auth = regAuthData({
    rpId: p.rpId,
    flags: p.flags,
    aaguid: p.aaguid,
    credentialId,
    publicKey: cred.publicKey,
  });
  const pubKey = brk === "pubarea-other-key" ? other.publicKey : cred.publicKey;
  const n = Buffer.from(pubKey.export({ format: "jwk" }).n!, "base64url");
  // fixedTPM | fixedParent | sensitiveDataOrigin | userWithAuth | noDA | sign
  const attrs =
    (brk === "not-fixed-tpm" ? 0 : 1 << 1) | (1 << 4) | (1 << 5) | (1 << 6) | (1 << 10) | (1 << 18);
  const pubArea = Buffer.concat([
    u16(0x0001), // RSA
    u16(0x000b), // nameAlg SHA-256
    u32(attrs),
    tpm2b(Buffer.alloc(0)),
    u16(0x0010), // symmetric NULL
    u16(0x0010), // scheme NULL
    u16(2048),
    u32(0),
    tpm2b(n),
  ]);
  const extra = createHash("sha256")
    .update(Buffer.concat([auth, p.clientDataHash]))
    .digest();
  if (brk === "extra-data") {
    extra[0] ^= 1;
  }
  const name = Buffer.concat([u16(0x000b), createHash("sha256").update(pubArea).digest()]);
  if (brk === "attested-name") {
    name[5] ^= 1;
  }
  const certInfo = Buffer.concat([
    u32(brk === "magic" ? 0xff544348 : 0xff544347),
    u16(0x8017),
    tpm2b(randomBytes(34)),
    tpm2b(extra),
    randomBytes(17),
    randomBytes(8),
    tpm2b(name),
    tpm2b(randomBytes(34)),
  ]);
  const aik = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const sanName = derSeq(
    derSet(
      derSeq(derOid("2.23.133.2.3"), derUtf8("id:00020065")),
      derSeq(derOid("2.23.133.2.2"), derUtf8("TEST")),
      derSeq(derOid("2.23.133.2.1"), derUtf8("id:54455354")),
    ),
  );
  const exts: Ext[] = [];
  if (brk !== "no-san") {
    exts.push({ oid: "2.5.29.17", critical: true, value: derSeq(derExplicit(4, sanName)) });
  }
  if (brk !== "no-eku") {
    exts.push({ oid: "2.5.29.37", value: derSeq(derOid("2.23.133.8.3")) });
  }
  if (brk === "aaguid-ext-mismatch") {
    exts.push({ oid: "1.3.6.1.4.1.45724.1.1.4", value: derOctets(randomBytes(16)) });
  }
  const aikDer = buildCert({
    subject: brk === "subject-not-empty" ? nameOf("aik") : EMPTY_NAME,
    publicKey: aik.publicKey,
    issuer: p.pki.intermediate,
    ca: false,
    extensions: exts,
  });
  const sig = cryptoSign(
    "sha256",
    certInfo,
    brk === "aik-signature" ? other.privateKey : aik.privateKey,
  );
  const stmt = new Map<string, Enc>([
    ["ver", "2.0"],
    ["alg", -257],
    ["x5c", [aikDer, p.pki.intermediateDer]],
    ["sig", sig],
    ["certInfo", certInfo],
    ["pubArea", pubArea],
  ]);
  return {
    fmt: "tpm",
    authDataRaw: auth,
    attestationObject: attObj("tpm", auth, stmt),
    credentialId,
    credentialKey: cred.privateKey,
    clientDataHash: p.clientDataHash,
  };
}

// ─── apple ───────────────────────────────────────────────────────────────

export type AppleBreak = "none" | "nonce" | "no-nonce" | "other-key";

export function buildAppleRegistration(p: {
  pki: TestPki;
  rpId: string;
  clientDataHash: Uint8Array;
  flags?: number;
  brk?: AppleBreak;
}): BuiltRegistration {
  const brk = p.brk ?? "none";
  const cred = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const other = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const credentialId = randomBytes(20);
  const auth = regAuthData({
    rpId: p.rpId,
    flags: p.flags,
    aaguid: "f24a8e70-d0d3-f82c-2937-32523cc4de5a",
    credentialId,
    publicKey: cred.publicKey,
  });
  const nonce = createHash("sha256")
    .update(Buffer.concat([auth, p.clientDataHash]))
    .digest();
  if (brk === "nonce") {
    nonce[0] ^= 1;
  }
  const exts: Ext[] =
    brk === "no-nonce"
      ? []
      : [{ oid: "1.2.840.113635.100.8.2", value: derSeq(derExplicit(1, derOctets(nonce))) }];
  const leaf = buildCert({
    subject: nameOf("apple credential"),
    publicKey: brk === "other-key" ? other.publicKey : cred.publicKey,
    issuer: p.pki.intermediate,
    ca: false,
    extensions: exts,
  });
  const stmt = new Map<string, Enc>([["x5c", [leaf, p.pki.intermediateDer]]]);
  return {
    fmt: "apple",
    authDataRaw: auth,
    attestationObject: attObj("apple", auth, stmt),
    credentialId,
    credentialKey: cred.privateKey,
    clientDataHash: p.clientDataHash,
  };
}

// ─── android-key ─────────────────────────────────────────────────────────

export type AndroidBreak =
  | "none"
  | "challenge"
  | "software"
  | "all-applications"
  | "imported"
  | "no-sign-purpose"
  | "unlocked"
  | "unverified-boot"
  | "signature";

export function buildAndroidKeyRegistration(p: {
  pki: TestPki;
  rpId: string;
  clientDataHash: Uint8Array;
  flags?: number;
  brk?: AndroidBreak;
}): BuiltRegistration {
  const brk = p.brk ?? "none";
  const cred = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const other = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const credentialId = randomBytes(32);
  const auth = regAuthData({
    rpId: p.rpId,
    flags: p.flags,
    aaguid: "b93fd961-f2e6-462f-b122-82002247de78",
    credentialId,
    publicKey: cred.publicKey,
  });
  const challenge = Buffer.from(p.clientDataHash);
  if (brk === "challenge") {
    challenge[0] ^= 1;
  }
  const rootOfTrust = derSeq(
    derOctets(randomBytes(32)),
    derBool(brk !== "unlocked"),
    derEnum(brk === "unverified-boot" ? 2 : 0),
    derOctets(randomBytes(32)),
  );
  const tee = derSeq(
    derExplicit(1, derSet(derInt(brk === "no-sign-purpose" ? 3 : 2))),
    derExplicit(2, derInt(3)),
    derExplicit(3, derInt(256)),
    derExplicit(503, derNull()),
    derExplicit(702, derInt(brk === "imported" ? 2 : 0)),
    derExplicit(704, rootOfTrust),
  );
  const software = derSeq(
    ...(brk === "all-applications" ? [derExplicit(600, derNull())] : []),
    derExplicit(701, derInt(1_700_000_000_000)),
  );
  const level = brk === "software" ? 0 : 1;
  const keyDescription = derSeq(
    derInt(200),
    derEnum(level),
    derInt(200),
    derEnum(level),
    derOctets(challenge),
    derOctets(Buffer.alloc(0)),
    software,
    tee,
  );
  const leaf = buildCert({
    subject: nameOf("Android Keystore Key"),
    publicKey: cred.publicKey,
    issuer: p.pki.intermediate,
    ca: false,
    extensions: [{ oid: "1.3.6.1.4.1.11129.2.1.17", value: keyDescription }],
  });
  const sig = cryptoSign("sha256", Buffer.concat([auth, p.clientDataHash]), {
    key: brk === "signature" ? other.privateKey : cred.privateKey,
    dsaEncoding: "der",
  });
  const stmt = new Map<string, Enc>([
    ["alg", -7],
    ["sig", sig],
    ["x5c", [leaf, p.pki.intermediateDer]],
  ]);
  return {
    fmt: "android-key",
    authDataRaw: auth,
    attestationObject: attObj("android-key", auth, stmt),
    credentialId,
    credentialKey: cred.privateKey,
    clientDataHash: p.clientDataHash,
  };
}
