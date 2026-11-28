// Attestation of device-bound platform authenticators (WebAuthn Level 3
// §8.3 "tpm", §8.4 "android-key", §8.8 "apple"): the statement proves the
// credential key was made inside the vendor's secure hardware (a TPM, the
// Secure Enclave, an Android TEE or StrongBox) and cannot leave it. Each
// statement must chain to its vendor's pinned root (attestation-roots.ts),
// carry the extensions its format requires, and bind this registration's
// authenticator data and client data hash. Any failure refuses the
// registration (WebAuthnError "attestation-invalid").

import { X509Certificate, constants, createHash, verify as cryptoVerify } from "node:crypto";
import { type PlatformAttestationFormat, pinnedRoots } from "./attestation-roots.js";
import {
  DER_CLASS,
  DerError,
  type Tlv,
  certExtensions,
  certSubjectEmpty,
  certVersion,
  children,
  parseDer,
  readBoolean,
  readOctets,
  readOid,
  readUint,
  seq,
} from "./der.js";
import { WebAuthnError } from "./webauthn-error.js";
import type {
  AttestationResult,
  AttestationStatement,
  CredentialPublicKey,
} from "./webauthn-types.js";

export type VendorRoots = Readonly<Record<PlatformAttestationFormat, readonly X509Certificate[]>>;

/** The pinned vendor roots (attestation-roots.ts), each checked against its fingerprint. */
export function pinnedVendorRoots(): VendorRoots {
  return {
    tpm: pinnedRoots("tpm"),
    apple: pinnedRoots("apple"),
    "android-key": pinnedRoots("android-key"),
  };
}

const MAX_CHAIN = 6;

function invalid(message: string): WebAuthnError {
  return new WebAuthnError("attestation-invalid", message);
}

function within(cert: X509Certificate, now: number): boolean {
  return now >= Date.parse(cert.validFrom) && now <= Date.parse(cert.validTo);
}

/**
 * Verify x5c[0] up to one of `roots`: each certificate is inside its
 * validity, each issuer is a CA whose key verifies the certificate below it,
 * and the last link is signed by a pinned root (a copy of the root inside
 * x5c is never trusted for itself). Returns the parsed x5c.
 */
export function verifyChainToRoots(
  x5c: readonly Uint8Array[],
  roots: readonly X509Certificate[],
  now: number,
  what: string,
): X509Certificate[] {
  if (x5c.length === 0) {
    throw new WebAuthnError("attestation-missing", `${what}: no attestation certificate`);
  }
  if (x5c.length > MAX_CHAIN) {
    throw invalid(`${what}: attestation chain longer than ${MAX_CHAIN}`);
  }
  if (roots.length === 0) {
    throw invalid(
      `${what}: no pinned root verifies (a pinned root does not match its fingerprint)`,
    );
  }
  let certs: X509Certificate[];
  try {
    certs = x5c.map((c) => new X509Certificate(Buffer.from(c)));
  } catch {
    throw invalid(`${what}: an attestation certificate does not parse`);
  }
  for (let i = 0; i < certs.length; i++) {
    const cur = certs[i];
    if (!within(cur, now)) {
      throw invalid(`${what}: certificate ${i} is outside its validity`);
    }
    if (i > 0 && !cur.ca) {
      throw invalid(`${what}: certificate ${i} issues another but is not a CA`);
    }
    const root = roots.find((r) => cur.checkIssued(r) && cur.verify(r.publicKey));
    if (root) {
      if (!within(root, now)) {
        throw invalid(`${what}: the vendor root is outside its validity`);
      }
      return certs;
    }
    const next = certs[i + 1];
    if (!next) {
      break;
    }
    if (!next.ca || !cur.checkIssued(next) || !cur.verify(next.publicKey)) {
      throw invalid(`${what}: certificate ${i} is not signed by certificate ${i + 1}`);
    }
  }
  throw invalid(`${what}: the attestation does not chain to the vendor's pinned root`);
}

function spki(key: X509Certificate["publicKey"]): Buffer {
  return key.export({ type: "spki", format: "der" });
}

function sameKey(cert: X509Certificate, pub: CredentialPublicKey, what: string): void {
  if (!spki(cert.publicKey).equals(spki(pub.key))) {
    throw invalid(`${what}: the certificate's key is not the credential key`);
  }
}

// ─── Signature algorithms of attestation statements ──────────────────────

type SigAlg = { hash: "sha1" | "sha256" | "sha384" | "sha512"; kind: "rsa" | "pss" | "ec" };

/**
 * COSE algorithms an attestation statement may be signed with. RS1 (SHA-1)
 * is accepted for "tpm" statements only: Windows signs most TPM attestations
 * with it. It never signs a credential (credential keys are ES256, EdDSA or
 * RS256), and the binding of the credential key to the TPM is the SHA-256
 * name of its public area, not this signature's hash.
 */
const SIG_ALGS: Readonly<Record<number, SigAlg>> = {
  [-7]: { hash: "sha256", kind: "ec" },
  [-35]: { hash: "sha384", kind: "ec" },
  [-36]: { hash: "sha512", kind: "ec" },
  [-257]: { hash: "sha256", kind: "rsa" },
  [-258]: { hash: "sha384", kind: "rsa" },
  [-259]: { hash: "sha512", kind: "rsa" },
  [-37]: { hash: "sha256", kind: "pss" },
  [-38]: { hash: "sha384", kind: "pss" },
  [-39]: { hash: "sha512", kind: "pss" },
  [-65535]: { hash: "sha1", kind: "rsa" },
};

function sigAlg(alg: number | undefined, fmt: PlatformAttestationFormat): SigAlg {
  const a = alg === undefined ? undefined : SIG_ALGS[alg];
  if (!a || (a.hash === "sha1" && fmt !== "tpm")) {
    throw invalid(`${fmt}: attestation algorithm ${String(alg)} is not accepted`);
  }
  return a;
}

function verifySig(cert: X509Certificate, a: SigAlg, data: Uint8Array, sig: Uint8Array): boolean {
  const key = cert.publicKey;
  const type = key.asymmetricKeyType;
  try {
    if (a.kind === "ec") {
      return type === "ec" && cryptoVerify(a.hash, data, { key, dsaEncoding: "der" }, sig);
    }
    if (type !== "rsa") {
      return false;
    }
    return cryptoVerify(
      a.hash,
      data,
      a.kind === "pss"
        ? {
            key,
            padding: constants.RSA_PKCS1_PSS_PADDING,
            saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
          }
        : { key, padding: constants.RSA_PKCS1_PADDING },
      sig,
    );
  } catch {
    return false;
  }
}

function digest(hash: string, data: Uint8Array): Buffer {
  return createHash(hash).update(data).digest();
}

// ─── Certificate extensions ──────────────────────────────────────────────

const OID = {
  aaguid: "1.3.6.1.4.1.45724.1.1.4",
  san: "2.5.29.17",
  eku: "2.5.29.37",
  tcgKpAikCertificate: "2.23.133.8.3",
  tpmManufacturer: "2.23.133.2.1",
  tpmModel: "2.23.133.2.2",
  tpmVersion: "2.23.133.2.3",
  appleNonce: "1.2.840.113635.100.8.2",
  androidKeyDescription: "1.3.6.1.4.1.11129.2.1.17",
} as const;

function extensions(der: Uint8Array, what: string): ReturnType<typeof certExtensions> {
  try {
    return certExtensions(der);
  } catch (err) {
    throw invalid(`${what}: certificate extensions do not parse (${(err as Error).message})`);
  }
}

function formatAaguid(b: Uint8Array): string {
  const h = Buffer.from(b).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** id-fido-gen-ce-aaguid, when present, must be non-critical and equal the authenticator's AAGUID. */
function checkCertAaguid(
  exts: ReturnType<typeof certExtensions>,
  aaguid: string,
  what: string,
): void {
  const e = exts.find((x) => x.oid === OID.aaguid);
  if (!e) {
    return;
  }
  let value: Uint8Array;
  try {
    value = readOctets(parseDer(e.value), "aaguid");
  } catch {
    throw invalid(`${what}: malformed AAGUID extension`);
  }
  if (e.critical || value.length !== 16) {
    throw invalid(`${what}: malformed AAGUID extension`);
  }
  if (formatAaguid(value) !== aaguid) {
    throw invalid(`${what}: certificate AAGUID differs from the authenticator's`);
  }
}

function result(
  fmt: PlatformAttestationFormat,
  aaguid: string,
  leaf: X509Certificate,
  leafDer: Uint8Array,
  alg: number | undefined,
): AttestationResult {
  return {
    fmt,
    aaguid,
    certSha256: createHash("sha256").update(leafDer).digest("hex"),
    certSubject: (leaf.subject ?? "").replace(/\n/g, ", "),
    certIssuer: leaf.issuer.replace(/\n/g, ", "),
    allowedAs: null,
    ...(alg !== undefined ? { alg } : {}),
  };
}

export type PlatformAttestationParams = {
  authDataRaw: Uint8Array;
  clientDataHash: Uint8Array;
  aaguid: string;
  credentialPublicKey: CredentialPublicKey;
  stmt: AttestationStatement;
  roots: VendorRoots;
  now: number;
};

// ─── apple (§8.8) ────────────────────────────────────────────────────────

/** Apple anonymous attestation: the credential certificate's nonce extension binds this registration. */
export function verifyAppleAttestation(p: PlatformAttestationParams): AttestationResult {
  const chain = verifyChainToRoots(p.stmt.x5c, p.roots.apple, p.now, "apple");
  const leaf = chain[0];
  const nonce = digest("sha256", Buffer.concat([p.authDataRaw, p.clientDataHash]));
  const ext = extensions(p.stmt.x5c[0], "apple").find((e) => e.oid === OID.appleNonce);
  if (!ext) {
    throw invalid("apple: the credential certificate has no nonce extension");
  }
  let certNonce: Uint8Array;
  try {
    // SEQUENCE { [1] EXPLICIT OCTET STRING }
    const items = seq(parseDer(ext.value), "apple nonce");
    const tagged = items.find((t) => t.cls === DER_CLASS.context && t.tag === 1);
    if (!tagged || items.length !== 1) {
      throw new DerError("no [1] nonce");
    }
    const inner = children(tagged);
    if (inner.length !== 1) {
      throw new DerError("nonce is not one OCTET STRING");
    }
    certNonce = readOctets(inner[0], "nonce");
  } catch (err) {
    throw invalid(`apple: malformed nonce extension (${(err as Error).message})`);
  }
  if (!nonce.equals(Buffer.from(certNonce))) {
    throw invalid("apple: the certificate's nonce does not bind this registration");
  }
  sameKey(leaf, p.credentialPublicKey, "apple");
  return result("apple", p.aaguid, leaf, p.stmt.x5c[0], undefined);
}

// ─── android-key (§8.4) ──────────────────────────────────────────────────

const KM_ORIGIN_GENERATED = 0;
const KM_PURPOSE_SIGN = 2;
const SECURITY_LEVEL_SOFTWARE = 0;
const VERIFIED_BOOT_VERIFIED = 0;

type AuthList = Map<number, Tlv>;

function authorizationList(t: Tlv, what: string): AuthList {
  const out: AuthList = new Map();
  for (const item of seq(t, what)) {
    if (item.cls !== DER_CLASS.context || !item.constructed) {
      throw new DerError(`${what}: entry is not an explicit tagged field`);
    }
    if (out.has(item.tag)) {
      throw new DerError(`${what}: tag ${item.tag} appears twice`);
    }
    const inner = children(item);
    if (inner.length !== 1) {
      throw new DerError(`${what}: tag ${item.tag} is not one value`);
    }
    out.set(item.tag, inner[0]);
  }
  return out;
}

export type AndroidKeyDescription = {
  attestationSecurityLevel: number;
  keymasterSecurityLevel: number;
  attestationChallenge: Uint8Array;
  softwareEnforced: AuthList;
  teeEnforced: AuthList;
};

export function parseAndroidKeyDescription(value: Uint8Array): AndroidKeyDescription {
  const f = seq(parseDer(value), "KeyDescription");
  if (f.length < 8) {
    throw new DerError("KeyDescription: too few fields");
  }
  readUint(f[0], "attestationVersion");
  return {
    attestationSecurityLevel: readUint(f[1], "attestationSecurityLevel"),
    keymasterSecurityLevel: readUint(f[3], "keymasterSecurityLevel"),
    attestationChallenge: readOctets(f[4], "attestationChallenge"),
    softwareEnforced: authorizationList(f[6], "softwareEnforced"),
    teeEnforced: authorizationList(f[7], "teeEnforced"),
  };
}

/**
 * Android key attestation: the statement is signed by the credential key's
 * own certificate, whose key description says the key was generated inside
 * a TEE or StrongBox (not imported), for signing only, for this client data
 * hash, on a device whose bootloader is locked with verified boot.
 */
export function verifyAndroidKeyAttestation(p: PlatformAttestationParams): AttestationResult {
  const a = sigAlg(p.stmt.alg, "android-key");
  const chain = verifyChainToRoots(p.stmt.x5c, p.roots["android-key"], p.now, "android-key");
  const leaf = chain[0];
  if (!verifySig(leaf, a, Buffer.concat([p.authDataRaw, p.clientDataHash]), p.stmt.sig)) {
    throw invalid("android-key: attestation signature does not verify");
  }
  sameKey(leaf, p.credentialPublicKey, "android-key");
  const ext = extensions(p.stmt.x5c[0], "android-key").find(
    (e) => e.oid === OID.androidKeyDescription,
  );
  if (!ext) {
    throw invalid("android-key: the credential certificate has no key description");
  }
  let kd: AndroidKeyDescription;
  try {
    kd = parseAndroidKeyDescription(ext.value);
  } catch (err) {
    throw invalid(`android-key: malformed key description (${(err as Error).message})`);
  }
  if (!Buffer.from(kd.attestationChallenge).equals(Buffer.from(p.clientDataHash))) {
    throw invalid(
      "android-key: the attestation challenge is not this registration's client data hash",
    );
  }
  if (
    kd.attestationSecurityLevel === SECURITY_LEVEL_SOFTWARE ||
    kd.keymasterSecurityLevel === SECURITY_LEVEL_SOFTWARE
  ) {
    throw invalid("android-key: the key is attested by software, not by secure hardware");
  }
  // allApplications [600]: a key usable by every app on the device is refused.
  if (kd.softwareEnforced.has(600) || kd.teeEnforced.has(600)) {
    throw invalid("android-key: the key is usable by every application (allApplications)");
  }
  const tee = kd.teeEnforced;
  try {
    const origin = tee.get(702);
    if (!origin || readUint(origin, "origin") !== KM_ORIGIN_GENERATED) {
      throw invalid("android-key: the key was not generated inside secure hardware (origin)");
    }
    const purpose = tee.get(1);
    const purposes =
      purpose && purpose.cls === 0 && purpose.tag === 17
        ? children(purpose).map((x) => readUint(x, "purpose"))
        : [];
    if (!purposes.includes(KM_PURPOSE_SIGN)) {
      throw invalid("android-key: the hardware does not enforce the signing purpose");
    }
    const rot = tee.get(704);
    if (!rot) {
      throw invalid("android-key: the hardware reports no root of trust");
    }
    const r = seq(rot, "rootOfTrust");
    if (r.length < 3) {
      throw new DerError("rootOfTrust: too few fields");
    }
    if (!readBoolean(r[1], "deviceLocked")) {
      throw invalid("android-key: the device's bootloader is unlocked");
    }
    if (readUint(r[2], "verifiedBootState") !== VERIFIED_BOOT_VERIFIED) {
      throw invalid("android-key: the device did not boot a verified system");
    }
  } catch (err) {
    if (err instanceof WebAuthnError) {
      throw err;
    }
    throw invalid(`android-key: malformed authorization list (${(err as Error).message})`);
  }
  return result("android-key", p.aaguid, leaf, p.stmt.x5c[0], p.stmt.alg);
}

// ─── tpm (§8.3) ──────────────────────────────────────────────────────────

const TPM_GENERATED_VALUE = 0xff544347;
const TPM_ST_ATTEST_CERTIFY = 0x8017;
const TPM_ALG = {
  RSA: 0x0001,
  SHA1: 0x0004,
  SHA256: 0x000b,
  SHA384: 0x000c,
  SHA512: 0x000d,
  NULL: 0x0010,
  ECC: 0x0023,
} as const;
const TPM_NAME_HASH: Readonly<Record<number, string>> = {
  [TPM_ALG.SHA1]: "sha1",
  [TPM_ALG.SHA256]: "sha256",
  [TPM_ALG.SHA384]: "sha384",
  [TPM_ALG.SHA512]: "sha512",
};
const TPM_ECC_CURVE: Readonly<Record<number, string>> = {
  0x0003: "P-256",
  0x0004: "P-384",
  0x0005: "P-521",
};

// TPMA_OBJECT bits the credential key must carry: it cannot be duplicated
// out of this TPM (fixedTPM), nor re-parented (fixedParent), and the TPM
// generated its private part itself (sensitiveDataOrigin). It signs (sign).
const TPMA_FIXED_TPM = 1 << 1;
const TPMA_FIXED_PARENT = 1 << 4;
const TPMA_SENSITIVE_DATA_ORIGIN = 1 << 5;
const TPMA_SIGN = 1 << 18;

class Reader {
  at = 0;
  constructor(readonly b: Buffer) {}
  u8(): number {
    this.need(1);
    return this.b.readUInt8(this.at++);
  }
  u16(): number {
    this.need(2);
    const v = this.b.readUInt16BE(this.at);
    this.at += 2;
    return v;
  }
  u32(): number {
    this.need(4);
    const v = this.b.readUInt32BE(this.at);
    this.at += 4;
    return v;
  }
  bytes(n: number): Buffer {
    this.need(n);
    const v = this.b.subarray(this.at, this.at + n);
    this.at += n;
    return v;
  }
  tpm2b(): Buffer {
    return this.bytes(this.u16());
  }
  done(what: string): void {
    if (this.at !== this.b.length) {
      throw invalid(`tpm: trailing bytes in ${what}`);
    }
  }
  private need(n: number): void {
    if (this.at + n > this.b.length) {
      throw invalid("tpm: structure truncated");
    }
  }
}

export type TpmPublic = {
  type: number;
  nameAlg: number;
  objectAttributes: number;
  rsa?: { keyBits: number; exponent: number; modulus: Buffer };
  ecc?: { curve: number; x: Buffer; y: Buffer };
};

/** TPMT_PUBLIC (TPM 2.0 Part 2 §12.2.4), for RSA and ECC signing keys. */
export function parseTpmPublic(raw: Uint8Array): TpmPublic {
  const r = new Reader(Buffer.from(raw));
  const type = r.u16();
  const nameAlg = r.u16();
  const objectAttributes = r.u32();
  r.tpm2b(); // authPolicy
  const symmetric = r.u16();
  if (symmetric !== TPM_ALG.NULL) {
    throw invalid("tpm: the credential key is a storage key (symmetric set)");
  }
  const scheme = r.u16();
  if (scheme !== TPM_ALG.NULL) {
    r.u16(); // the scheme's hashAlg
  }
  if (type === TPM_ALG.RSA) {
    const keyBits = r.u16();
    const exponent = r.u32();
    const modulus = r.tpm2b();
    r.done("pubArea");
    return { type, nameAlg, objectAttributes, rsa: { keyBits, exponent, modulus } };
  }
  if (type === TPM_ALG.ECC) {
    const curve = r.u16();
    const kdf = r.u16();
    if (kdf !== TPM_ALG.NULL) {
      r.u16();
    }
    const x = r.tpm2b();
    const y = r.tpm2b();
    r.done("pubArea");
    return { type, nameAlg, objectAttributes, ecc: { curve, x, y } };
  }
  throw invalid(`tpm: public area type ${type} is not RSA or ECC`);
}

export type TpmCertifyInfo = {
  magic: number;
  type: number;
  extraData: Buffer;
  attestedName: Buffer;
};

/** TPMS_ATTEST carrying TPMS_CERTIFY_INFO (TPM 2.0 Part 2 §10.12.12). */
export function parseTpmCertInfo(raw: Uint8Array): TpmCertifyInfo {
  const r = new Reader(Buffer.from(raw));
  const magic = r.u32();
  const type = r.u16();
  r.tpm2b(); // qualifiedSigner
  const extraData = r.tpm2b();
  r.bytes(17); // clockInfo: clock u64, resetCount u32, restartCount u32, safe u8
  r.bytes(8); // firmwareVersion
  const attestedName = r.tpm2b();
  r.tpm2b(); // qualifiedName
  r.done("certInfo");
  return { magic, type, extraData, attestedName };
}

function stripLeadingZeros(b: Uint8Array): Buffer {
  let i = 0;
  while (i < b.length - 1 && b[i] === 0) {
    i++;
  }
  return Buffer.from(b.subarray(i));
}

/** The pubArea's key must be the credential key, parameter for parameter. */
function checkPubAreaKey(pub: TpmPublic, cred: CredentialPublicKey): void {
  const jwk = cred.key.export({ format: "jwk" });
  if (pub.rsa) {
    if (jwk.kty !== "RSA" || !jwk.n || !jwk.e) {
      throw invalid("tpm: the public area is RSA, the credential key is not");
    }
    const exponent = pub.rsa.exponent === 0 ? 65537 : pub.rsa.exponent;
    const e = Buffer.from(jwk.e, "base64url").readUIntBE(0, Buffer.from(jwk.e, "base64url").length);
    const n = Buffer.from(jwk.n, "base64url");
    if (
      e !== exponent ||
      !stripLeadingZeros(n).equals(stripLeadingZeros(pub.rsa.modulus)) ||
      pub.rsa.keyBits !== n.length * 8
    ) {
      throw invalid("tpm: the public area's RSA key is not the credential key");
    }
    return;
  }
  if (pub.ecc) {
    const crv = TPM_ECC_CURVE[pub.ecc.curve];
    if (jwk.kty !== "EC" || !jwk.x || !jwk.y || crv !== jwk.crv) {
      throw invalid("tpm: the public area's curve is not the credential key's");
    }
    if (
      !Buffer.from(jwk.x, "base64url").equals(pub.ecc.x) ||
      !Buffer.from(jwk.y, "base64url").equals(pub.ecc.y)
    ) {
      throw invalid("tpm: the public area's EC point is not the credential key");
    }
    return;
  }
  throw invalid("tpm: the public area carries no key");
}

type TpmSan = { manufacturer: string; model: string; version: string };

/** The TPM's identity from the AIK certificate's subjectAltName directoryName. */
function tpmSan(value: Uint8Array): TpmSan {
  const found = new Map<string, string>();
  for (const gn of seq(parseDer(value), "GeneralNames")) {
    if (gn.cls !== DER_CLASS.context || gn.tag !== 4) {
      continue;
    }
    const names = children(gn);
    if (names.length !== 1) {
      throw new DerError("directoryName is not one Name");
    }
    for (const rdn of children(names[0])) {
      for (const atv of children(rdn)) {
        const [oid, val] = seq(atv, "AttributeTypeAndValue");
        const key = readOid(oid);
        if (found.has(key)) {
          throw new DerError(`attribute ${key} appears twice`);
        }
        found.set(key, Buffer.from(val.buf.subarray(val.start, val.end)).toString("utf8"));
      }
    }
  }
  const manufacturer = found.get(OID.tpmManufacturer);
  const model = found.get(OID.tpmModel);
  const version = found.get(OID.tpmVersion);
  if (!manufacturer || model === undefined || version === undefined) {
    throw new DerError("TPM manufacturer, model or version missing");
  }
  return { manufacturer, model, version };
}

/**
 * TPM attestation (Windows Hello): the TPM certified (TPM2_Certify) that the
 * credential key is a TPM-resident, non-duplicable key it generated, with
 * this registration's hash as qualifying data, signed by an attestation
 * identity key whose certificate chains to the TPM vendor root.
 */
export function verifyTpmAttestation(p: PlatformAttestationParams): AttestationResult {
  const s = p.stmt;
  if (s.ver !== "2.0") {
    throw invalid(`tpm: version ${String(s.ver)} is not 2.0`);
  }
  if (!s.certInfo || !s.pubArea) {
    throw new WebAuthnError("attestation-format", "tpm: certInfo or pubArea missing");
  }
  const a = sigAlg(s.alg, "tpm");
  // pubArea: the credential key, made and kept by this TPM.
  const pub = parseTpmPublic(s.pubArea);
  checkPubAreaKey(pub, p.credentialPublicKey);
  const need = TPMA_FIXED_TPM | TPMA_FIXED_PARENT | TPMA_SENSITIVE_DATA_ORIGIN | TPMA_SIGN;
  if ((pub.objectAttributes & need) !== need) {
    throw invalid(
      "tpm: the credential key is not a signing key generated in and fixed to this TPM",
    );
  }
  const nameHash = TPM_NAME_HASH[pub.nameAlg];
  if (!nameHash) {
    throw invalid(`tpm: name algorithm ${pub.nameAlg} is not accepted`);
  }
  // certInfo: TPM2_Certify over that key, qualified by this registration.
  const info = parseTpmCertInfo(s.certInfo);
  if (info.magic !== TPM_GENERATED_VALUE || info.type !== TPM_ST_ATTEST_CERTIFY) {
    throw invalid("tpm: certInfo is not a TPM-generated certification");
  }
  const attToBeSigned = Buffer.concat([p.authDataRaw, p.clientDataHash]);
  if (!info.extraData.equals(digest(a.hash, attToBeSigned))) {
    throw invalid("tpm: certInfo does not bind this registration (extraData)");
  }
  const nameAlg = Buffer.alloc(2);
  nameAlg.writeUInt16BE(pub.nameAlg);
  const name = Buffer.concat([nameAlg, digest(nameHash, s.pubArea)]);
  if (!info.attestedName.equals(name)) {
    throw invalid("tpm: certInfo certifies a different key (attested name)");
  }
  // The AIK certificate and its chain.
  const chain = verifyChainToRoots(s.x5c, p.roots.tpm, p.now, "tpm");
  const aik = chain[0];
  if (!verifySig(aik, a, s.certInfo, s.sig)) {
    throw invalid("tpm: the attestation identity key's signature does not verify");
  }
  const aikDer = s.x5c[0];
  let san: TpmSan;
  try {
    if (certVersion(aikDer) !== 2) {
      throw invalid("tpm: the AIK certificate is not X.509 v3");
    }
    if (!certSubjectEmpty(aikDer)) {
      throw invalid("tpm: the AIK certificate's subject is not empty");
    }
    const exts = extensions(aikDer, "tpm");
    const sanExt = exts.find((e) => e.oid === OID.san);
    if (!sanExt) {
      throw invalid("tpm: the AIK certificate has no subject alternative name");
    }
    san = tpmSan(sanExt.value);
    const eku = exts.find((e) => e.oid === OID.eku);
    const purposes = eku ? seq(parseDer(eku.value), "EKU").map((x) => readOid(x)) : [];
    if (!purposes.includes(OID.tcgKpAikCertificate)) {
      throw invalid("tpm: the AIK certificate lacks the tcg-kp-AIKCertificate key purpose");
    }
    checkCertAaguid(exts, p.aaguid, "tpm");
  } catch (err) {
    if (err instanceof WebAuthnError) {
      throw err;
    }
    throw invalid(`tpm: malformed AIK certificate (${(err as Error).message})`);
  }
  if (aik.ca) {
    throw invalid("tpm: the AIK certificate is a CA certificate");
  }
  if (!/^id:[0-9A-F]{8}$/.test(san.manufacturer)) {
    throw invalid(
      `tpm: TPM manufacturer ${JSON.stringify(san.manufacturer)} is not a TCG vendor id`,
    );
  }
  return {
    ...result("tpm", p.aaguid, aik, aikDer, s.alg),
    certSubject: `TPM ${san.manufacturer} ${san.model} ${san.version}`,
  };
}

/** Verify a platform format's statement with the given roots. */
export function verifyPlatformAttestation(
  fmt: PlatformAttestationFormat,
  p: PlatformAttestationParams,
): AttestationResult {
  switch (fmt) {
    case "tpm":
      return verifyTpmAttestation(p);
    case "apple":
      return verifyAppleAttestation(p);
    case "android-key":
      return verifyAndroidKeyAttestation(p);
  }
  throw new WebAuthnError("attestation-format", `unknown platform format ${String(fmt)}`);
}
