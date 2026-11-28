// WebAuthn / FIDO2 verification, written against the W3C WebAuthn Level 3
// algorithms (§7.1 registration, §7.2 authentication) with the checks this
// deployment needs and none of the relaxations a web relying party may take:
//
//   - user presence (UP) AND user verification (UV) are required on every
//     registration and every assertion; there is no parameter that turns
//     either off;
//   - a backup-eligible credential (BE flag: a synced passkey, whose private
//     key is copied to a vendor cloud and to other devices) is refused;
//   - the signature counter must strictly increase per credential; a counter
//     that does not move (including an authenticator that never counts) or
//     goes backwards is refused (cloned-authenticator signal, §6.1.1);
//   - registration needs a device-bound attestation: "tpm", "apple" or
//     "android-key" chained to the vendor's pinned root, or "packed" with an
//     attestation certificate chain to a pinned root of a recognized hardware
//     security key model (attestation-roots-packed.ts, from the FIDO
//     Metadata Service), for that model's AAGUID. Self attestation, "none",
//     an unrecognized model or certificate authority (a software or virtual
//     authenticator such as Chromium's) are refused.
//
// Credential keys: ES256 (COSE -7, ECDSA P-256 / SHA-256) and EdDSA (COSE -8,
// Ed25519). Signature checks use node:crypto only.

import {
  X509Certificate,
  constants,
  createHash,
  createPublicKey,
  timingSafeEqual,
  verify as cryptoVerify,
} from "node:crypto";
import {
  type VendorRoots,
  pinnedVendorRoots,
  verifyChainToRoots,
  verifyPlatformAttestation,
} from "./attestation-platform.js";
import { PACKED_HARDWARE_MODELS, PACKED_HARDWARE_ROOTS } from "./attestation-roots-packed.js";
import { type PlatformAttestationFormat, loadPinnedRoot } from "./attestation-roots.js";
import { CborError, decodeCbor, decodeCborItem, type CborValue } from "./cbor.js";
import { WebAuthnError } from "./webauthn-error.js";
import type {
  AttestationResult,
  AttestationStatement,
  CoseAlg,
  CredentialPublicKey,
} from "./webauthn-types.js";

export type {
  AcceptedAttestationFormat,
  AttestationResult,
  AttestationStatement,
  CoseAlg,
  CredentialPublicKey,
} from "./webauthn-types.js";

export { WebAuthnError, type WebAuthnErrorCode } from "./webauthn-error.js";

const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_BE = 0x08;
const FLAG_BS = 0x10;
const FLAG_AT = 0x40;
const FLAG_ED = 0x80;

export const COSE_ALG_ES256 = -7;
export const COSE_ALG_EDDSA = -8;
/** RSASSA-PKCS1-v1_5 with SHA-256: the credential key Windows Hello makes on most TPMs. */
export const COSE_ALG_RS256 = -257;

/** The smallest RSA credential modulus accepted, in bits. */
export const MIN_RSA_BITS = 2048;

export type AuthenticatorFlags = {
  up: boolean;
  uv: boolean;
  be: boolean;
  bs: boolean;
  at: boolean;
  ed: boolean;
};

export type ParsedAuthenticatorData = {
  rpIdHash: Uint8Array;
  flags: AuthenticatorFlags;
  signCount: number;
  attested: null | {
    aaguid: string;
    credentialId: Uint8Array;
    publicKey: CredentialPublicKey;
  };
};

export function sha256(data: Uint8Array | string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(data).digest());
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export function b64url(data: Uint8Array): string {
  return Buffer.from(data).toString("base64url");
}

export function fromB64url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) {
    throw new WebAuthnError("bad-client-data", "not base64url");
  }
  return new Uint8Array(Buffer.from(text, "base64url"));
}

function formatAaguid(bytes: Uint8Array): string {
  const h = Buffer.from(bytes).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Turn a COSE_Key (RFC 9052/9053, RFC 8230) into a verification key. ES256, EdDSA and RS256 only. */
export function coseToPublicKey(cose: Uint8Array): CredentialPublicKey {
  let map: CborValue;
  try {
    map = decodeCbor(cose);
  } catch (err) {
    throw new WebAuthnError("bad-public-key", `credential key is not CBOR: ${String(err)}`);
  }
  if (!(map instanceof Map)) {
    throw new WebAuthnError("bad-public-key", "credential key is not a COSE map");
  }
  const kty = map.get(1);
  const alg = map.get(3);
  const crv = map.get(-1);
  const x = map.get(-2);
  try {
    if (kty === 2 && alg === COSE_ALG_ES256) {
      const y = map.get(-3);
      if (crv !== 1 || !(x instanceof Uint8Array) || !(y instanceof Uint8Array)) {
        throw new WebAuthnError("bad-public-key", "ES256 key must be P-256 with x and y");
      }
      if (x.length !== 32 || y.length !== 32) {
        throw new WebAuthnError("bad-public-key", "ES256 coordinates must be 32 bytes");
      }
      const key = createPublicKey({
        key: { kty: "EC", crv: "P-256", x: b64url(x), y: b64url(y) },
        format: "jwk",
      });
      return { alg: COSE_ALG_ES256, cose, key };
    }
    if (kty === 1 && alg === COSE_ALG_EDDSA) {
      if (crv !== 6 || !(x instanceof Uint8Array) || x.length !== 32) {
        throw new WebAuthnError("bad-public-key", "EdDSA key must be Ed25519 with a 32-byte x");
      }
      const key = createPublicKey({
        key: { kty: "OKP", crv: "Ed25519", x: b64url(x) },
        format: "jwk",
      });
      return { alg: COSE_ALG_EDDSA, cose, key };
    }
    if (kty === 3 && alg === COSE_ALG_RS256) {
      const n = map.get(-1);
      const e = map.get(-2);
      if (!(n instanceof Uint8Array) || !(e instanceof Uint8Array) || n.length === 0) {
        throw new WebAuthnError("bad-public-key", "RS256 key must carry n and e");
      }
      if (n[0] === 0 || e.length === 0 || e[0] === 0 || e.length > 4) {
        throw new WebAuthnError("bad-public-key", "RS256 n and e must be minimal big-endian");
      }
      const bits = (n.length - 1) * 8 + (32 - Math.clz32(n[0]));
      if (bits < MIN_RSA_BITS) {
        throw new WebAuthnError(
          "bad-public-key",
          `RS256 key is ${bits} bits; at least ${MIN_RSA_BITS} are required`,
        );
      }
      const eNum = Buffer.from(e).readUIntBE(0, e.length);
      if (eNum < 3 || eNum % 2 === 0) {
        throw new WebAuthnError(
          "bad-public-key",
          "RS256 public exponent must be odd and at least 3",
        );
      }
      const key = createPublicKey({
        key: { kty: "RSA", n: b64url(n), e: b64url(e) },
        format: "jwk",
      });
      return { alg: COSE_ALG_RS256, cose, key };
    }
  } catch (err) {
    if (err instanceof WebAuthnError) {
      throw err;
    }
    // createPublicKey rejects points that are not on the curve.
    throw new WebAuthnError("bad-public-key", `invalid credential key: ${String(err)}`);
  }
  throw new WebAuthnError(
    "unsupported-alg",
    `credential algorithm kty=${JSON.stringify(kty)} alg=${JSON.stringify(alg)} is not accepted (ES256, EdDSA or RS256 only)`,
  );
}

/** Parse raw authenticator data (WebAuthn §6.1). */
export function parseAuthenticatorData(raw: Uint8Array): ParsedAuthenticatorData {
  if (raw.length < 37) {
    throw new WebAuthnError("bad-authdata", "authenticator data shorter than 37 bytes");
  }
  const rpIdHash = raw.slice(0, 32);
  const f = raw[32];
  const flags: AuthenticatorFlags = {
    up: (f & FLAG_UP) !== 0,
    uv: (f & FLAG_UV) !== 0,
    be: (f & FLAG_BE) !== 0,
    bs: (f & FLAG_BS) !== 0,
    at: (f & FLAG_AT) !== 0,
    ed: (f & FLAG_ED) !== 0,
  };
  if (flags.bs && !flags.be) {
    throw new WebAuthnError("bad-authdata", "backup state set without backup eligibility");
  }
  const signCount = new DataView(raw.buffer, raw.byteOffset + 33, 4).getUint32(0);
  let at = 37;
  let attested: ParsedAuthenticatorData["attested"] = null;
  try {
    if (flags.at) {
      if (raw.length < at + 18) {
        throw new WebAuthnError("bad-authdata", "attested credential data truncated");
      }
      const aaguid = raw.slice(at, at + 16);
      const idLen = (raw[at + 16] << 8) | raw[at + 17];
      at += 18;
      if (idLen < 1 || idLen > 1023 || raw.length < at + idLen) {
        throw new WebAuthnError("bad-authdata", "credential id length out of range");
      }
      const credentialId = raw.slice(at, at + idLen);
      at += idLen;
      const item = decodeCborItem(raw, at);
      const cose = raw.slice(at, item.end);
      at = item.end;
      attested = { aaguid: formatAaguid(aaguid), credentialId, publicKey: coseToPublicKey(cose) };
    }
    if (flags.ed) {
      const ext = decodeCborItem(raw, at);
      if (!(ext.value instanceof Map)) {
        throw new WebAuthnError("bad-authdata", "extensions are not a CBOR map");
      }
      at = ext.end;
    }
  } catch (err) {
    if (err instanceof WebAuthnError) {
      throw err;
    }
    if (err instanceof CborError) {
      throw new WebAuthnError("bad-authdata", `authenticator data: ${err.message}`);
    }
    throw err;
  }
  if (at !== raw.length) {
    throw new WebAuthnError("bad-authdata", "trailing bytes in authenticator data");
  }
  return { rpIdHash, flags, signCount, attested };
}

export type ExpectedClientData = {
  type: "webauthn.create" | "webauthn.get";
  challenge: Uint8Array;
  origin: string;
};

/** WebAuthn §7.1 steps 5-11 / §7.2 steps 9-15: parse and check clientDataJSON; return its hash. */
export function verifyClientData(
  clientDataJSON: Uint8Array,
  expected: ExpectedClientData,
): Uint8Array {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(clientDataJSON));
  } catch {
    throw new WebAuthnError("bad-client-data", "clientDataJSON is not UTF-8 JSON");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new WebAuthnError("bad-client-data", "clientDataJSON is not an object");
  }
  const c = parsed as Record<string, unknown>;
  if (c.type !== expected.type) {
    throw new WebAuthnError("type-mismatch", `clientData.type is ${String(c.type)}`);
  }
  if (typeof c.challenge !== "string" || !equalBytes(fromB64url(c.challenge), expected.challenge)) {
    throw new WebAuthnError(
      "challenge-mismatch",
      "clientData.challenge is not the issued challenge",
    );
  }
  if (c.origin !== expected.origin) {
    throw new WebAuthnError("origin-mismatch", `clientData.origin is ${String(c.origin)}`);
  }
  if (c.crossOrigin === true) {
    throw new WebAuthnError("origin-mismatch", "cross-origin ceremonies are not accepted");
  }
  return sha256(clientDataJSON);
}

function checkRpAndFlags(auth: ParsedAuthenticatorData, rpId: string): void {
  if (!equalBytes(auth.rpIdHash, sha256(rpId))) {
    throw new WebAuthnError("rp-mismatch", "rpIdHash does not match the relying party id");
  }
  if (!auth.flags.up) {
    throw new WebAuthnError(
      "no-user-presence",
      "the authenticator did not assert user presence (UP=0)",
    );
  }
  if (!auth.flags.uv) {
    throw new WebAuthnError(
      "no-user-verification",
      "the authenticator did not verify the user (UV=0): a PIN or biometric is required",
    );
  }
  if (auth.flags.be) {
    throw new WebAuthnError(
      "backup-eligible",
      "the credential is backup-eligible (a synced passkey); only device-bound credentials are accepted",
    );
  }
}

/** Verify one signature with a credential key, per its COSE algorithm. */
export function verifyWithCredentialKey(
  pub: CredentialPublicKey,
  data: Uint8Array,
  signature: Uint8Array,
): boolean {
  try {
    if (pub.alg === COSE_ALG_ES256) {
      return cryptoVerify("sha256", data, { key: pub.key, dsaEncoding: "der" }, signature);
    }
    if (pub.alg === COSE_ALG_RS256) {
      return cryptoVerify(
        "sha256",
        data,
        { key: pub.key, padding: constants.RSA_PKCS1_PADDING },
        signature,
      );
    }
    return cryptoVerify(null, data, pub.key, signature);
  } catch {
    return false;
  }
}

// ─── Attestation (packed, basic) ─────────────────────────────────────────

/** An authenticator model an administrator allows, with the CA(s) its attestation must chain to. */
export type AllowedAuthenticator = {
  aaguid: string;
  description?: string;
  /** PEM certificates: the CA that issues this model's attestation certificates (root or intermediate). */
  attestationCas: string[];
};

export type AttestationPolicy = {
  /**
   * An organization's allowlist, which only narrows: empty, any recognized
   * device-bound model; non-empty, only these models, whose attestation must
   * also chain to the CAs given (in addition to the pinned vendor root).
   */
  allowedAuthenticators: AllowedAuthenticator[];
  now?: number;
};

/** The hardware security key models a packed attestation may come from, with the CAs each chains to. */
export type PackedTrust = Readonly<{
  models: ReadonlyMap<string, Readonly<{ description: string; roots: readonly X509Certificate[] }>>;
}>;

let pinnedPacked: PackedTrust | null = null;

/**
 * The pinned packed trust (attestation-roots-packed.ts): each root checked
 * against its fingerprint (a root whose PEM does not match is never trusted),
 * each model with the roots it names.
 */
export function pinnedPackedTrust(): PackedTrust {
  if (pinnedPacked) {
    return pinnedPacked;
  }
  const roots = new Map<string, X509Certificate>();
  for (const r of PACKED_HARDWARE_ROOTS) {
    const cert = loadPinnedRoot(r);
    if (cert) {
      roots.set(r.sha256, cert);
    }
  }
  const models = new Map<string, { description: string; roots: X509Certificate[] }>();
  for (const m of PACKED_HARDWARE_MODELS) {
    models.set(m.aaguid, {
      description: m.description,
      roots: m.roots.map((f) => roots.get(f)).filter((c): c is X509Certificate => c !== undefined),
    });
  }
  pinnedPacked = { models };
  return pinnedPacked;
}

// Software authenticators that present a packed attestation from their own CA:
// Chromium's WebAuthn virtual authenticator (DevTools, WebDriver) signs with
// "C=US, O=Chromium, OU=Authenticator Attestation, CN=Batch Certificate".
// Refused by name too, so the reason is plain (no pinned root issues it anyway).
const SOFTWARE_AUTHENTICATOR_ORG = /(^|\n)O=Chromium(\n|$)/;

export const PLATFORM_FORMATS: readonly PlatformAttestationFormat[] = [
  "tpm",
  "apple",
  "android-key",
];

// id-fido-gen-ce-aaguid, 1.3.6.1.4.1.45724.1.1.4, DER-encoded OID.
const AAGUID_OID = Buffer.from("060b2b0601040182e51c010104", "hex");

/** The AAGUID extension of an attestation certificate, when present. */
function certAaguid(der: Uint8Array): string | null {
  const buf = Buffer.from(der);
  const at = buf.indexOf(AAGUID_OID);
  if (at < 0) {
    return null;
  }
  let p = at + AAGUID_OID.length;
  // Optional `critical BOOLEAN`.
  if (buf[p] === 0x01 && buf[p + 1] === 0x01) {
    if (buf[p + 2] !== 0x00) {
      throw new WebAuthnError("attestation-invalid", "the AAGUID extension must not be critical");
    }
    p += 3;
  }
  // extnValue OCTET STRING { OCTET STRING (16) }
  if (buf[p] !== 0x04 || buf[p + 1] !== 0x12 || buf[p + 2] !== 0x04 || buf[p + 3] !== 0x10) {
    throw new WebAuthnError("attestation-invalid", "malformed AAGUID extension");
  }
  return formatAaguid(buf.subarray(p + 4, p + 20));
}

function attestationVerify(
  cert: X509Certificate,
  alg: number | undefined,
  data: Uint8Array,
  sig: Uint8Array,
): boolean {
  const key = cert.publicKey;
  const type = key.asymmetricKeyType;
  try {
    if (type === "ec") {
      const curve = key.asymmetricKeyDetails?.namedCurve;
      const hash = curve === "prime256v1" ? "sha256" : curve === "secp384r1" ? "sha384" : null;
      if (!hash || (alg !== undefined && alg !== -7 && alg !== -35)) {
        return false;
      }
      return cryptoVerify(hash, data, { key, dsaEncoding: "der" }, sig);
    }
    if (type === "ed25519") {
      if (alg !== undefined && alg !== -8) {
        return false;
      }
      return cryptoVerify(null, data, key, sig);
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * WebAuthn §8.2 packed attestation, basic (x5c) only: a recognized hardware
 * security key model (by AAGUID) whose attestation chains to that model's
 * pinned root, then the organization's allowlist, which only narrows.
 */
export function verifyPackedAttestation(params: {
  authDataRaw: Uint8Array;
  clientDataHash: Uint8Array;
  aaguid: string;
  stmt: AttestationStatement;
  policy: AttestationPolicy;
  /** The pinned packed trust unless a caller passes another (the gate tests' test CA). */
  trust?: PackedTrust;
}): AttestationResult {
  const { stmt, policy } = params;
  if (stmt.x5c.length === 0) {
    throw new WebAuthnError(
      "attestation-missing",
      "the authenticator gave only self attestation; a basic attestation certificate is required",
    );
  }
  let leaf: X509Certificate;
  try {
    leaf = new X509Certificate(Buffer.from(stmt.x5c[0]));
  } catch {
    throw new WebAuthnError("attestation-invalid", "attestation certificate does not parse");
  }
  const signed = Buffer.concat([params.authDataRaw, params.clientDataHash]);
  if (!attestationVerify(leaf, stmt.alg, signed, stmt.sig)) {
    throw new WebAuthnError("attestation-invalid", "attestation signature does not verify");
  }
  // §8.2.1 certificate requirements.
  if (leaf.ca) {
    throw new WebAuthnError("attestation-invalid", "attestation certificate is a CA certificate");
  }
  if (!/(^|\n)OU=Authenticator Attestation(\n|$)/.test(leaf.subject)) {
    throw new WebAuthnError(
      "attestation-invalid",
      "attestation certificate subject lacks OU=Authenticator Attestation",
    );
  }
  const now = policy.now ?? Date.now();
  if (now < Date.parse(leaf.validFrom) || now > Date.parse(leaf.validTo)) {
    throw new WebAuthnError(
      "attestation-invalid",
      "attestation certificate is outside its validity",
    );
  }
  const extAaguid = certAaguid(stmt.x5c[0]);
  if (extAaguid !== null && extAaguid !== params.aaguid) {
    throw new WebAuthnError(
      "attestation-invalid",
      "certificate AAGUID differs from the authenticator's",
    );
  }
  if (params.aaguid === "00000000-0000-0000-0000-000000000000") {
    throw new WebAuthnError(
      "zero-aaguid",
      "the authenticator does not identify its model (zero AAGUID)",
    );
  }
  for (const der of stmt.x5c) {
    let c: X509Certificate;
    try {
      c = new X509Certificate(Buffer.from(der));
    } catch {
      throw new WebAuthnError("attestation-invalid", "attestation certificate does not parse");
    }
    if (SOFTWARE_AUTHENTICATOR_ORG.test(c.subject) || SOFTWARE_AUTHENTICATOR_ORG.test(c.issuer)) {
      throw new WebAuthnError(
        "attestation-not-allowed",
        "this is a browser's virtual (software) authenticator, not a device-bound hardware key",
      );
    }
  }
  const model = (params.trust ?? pinnedPackedTrust()).models.get(params.aaguid);
  if (!model) {
    throw new WebAuthnError(
      "attestation-not-allowed",
      `authenticator model ${params.aaguid} is not a recognized hardware security key (packed attestation is accepted only from certified hardware keys of known vendors); software and virtual authenticators are not a second factor`,
    );
  }
  try {
    verifyChainToRoots(stmt.x5c, model.roots, now, `packed (${model.description})`);
  } catch (err) {
    throw new WebAuthnError(
      "attestation-not-allowed",
      `the attestation does not chain to the certificate authority of ${model.description}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  let allowedAs: string | null = model.description;
  if (policy.allowedAuthenticators.length > 0) {
    const entry = policy.allowedAuthenticators.find(
      (e) => e.aaguid.toLowerCase() === params.aaguid,
    );
    if (!entry) {
      throw new WebAuthnError(
        "attestation-not-allowed",
        `authenticator model ${params.aaguid} is not on this deployment's allowlist`,
      );
    }
    const chained = entry.attestationCas.some((pem) => {
      try {
        const ca = new X509Certificate(pem);
        return ca.ca && leaf.checkIssued(ca) && leaf.verify(ca.publicKey);
      } catch {
        return false;
      }
    });
    if (!chained) {
      throw new WebAuthnError(
        "attestation-not-allowed",
        `the attestation certificate does not chain to the CA configured for ${entry.description ?? entry.aaguid}`,
      );
    }
    allowedAs = entry.description ?? entry.aaguid;
  }
  return {
    fmt: "packed",
    aaguid: params.aaguid,
    certSha256: Buffer.from(sha256(stmt.x5c[0])).toString("hex"),
    certSubject: leaf.subject.replace(/\n/g, ", "),
    certIssuer: leaf.issuer.replace(/\n/g, ", "),
    allowedAs,
  };
}

/**
 * A platform format's statement (attestation-platform.ts), then the rules
 * shared with packed: a model that names itself (non-zero AAGUID) and, when
 * the deployment keeps an allowlist, a listed model. The vendor root is the
 * chain anchor; an allowlist entry's CAs, when given, must also issue the
 * attestation certificate's chain.
 */
function verifyPlatformStatement(
  fmt: PlatformAttestationFormat,
  p: {
    authDataRaw: Uint8Array;
    clientDataHash: Uint8Array;
    aaguid: string;
    credentialPublicKey: CredentialPublicKey;
    stmt: AttestationStatement;
    policy: AttestationPolicy;
    roots: VendorRoots;
  },
): AttestationResult {
  if (p.aaguid === "00000000-0000-0000-0000-000000000000") {
    throw new WebAuthnError(
      "zero-aaguid",
      "the authenticator does not identify its model (zero AAGUID)",
    );
  }
  const now = p.policy.now ?? Date.now();
  const res = verifyPlatformAttestation(fmt, { ...p, now });
  if (p.policy.allowedAuthenticators.length === 0) {
    return res;
  }
  const entry = p.policy.allowedAuthenticators.find((e) => e.aaguid.toLowerCase() === p.aaguid);
  if (!entry) {
    throw new WebAuthnError(
      "attestation-not-allowed",
      `authenticator model ${p.aaguid} is not on this deployment's allowlist`,
    );
  }
  if (entry.attestationCas.length > 0) {
    const certs = p.stmt.x5c.map((c) => new X509Certificate(Buffer.from(c)));
    const chained = entry.attestationCas.some((pem) => {
      try {
        const ca = new X509Certificate(pem);
        return ca.ca && certs.some((c) => c.checkIssued(ca) && c.verify(ca.publicKey));
      } catch {
        return false;
      }
    });
    if (!chained) {
      throw new WebAuthnError(
        "attestation-not-allowed",
        `the attestation does not chain to the CA configured for ${entry.description ?? entry.aaguid}`,
      );
    }
  }
  return { ...res, allowedAs: entry.description ?? entry.aaguid };
}

// ─── Registration and assertion ──────────────────────────────────────────

export type RegistrationResult = {
  credentialId: Uint8Array;
  publicKey: CredentialPublicKey;
  signCount: number;
  aaguid: string;
  attestation: AttestationResult;
};

/** Decode a WebAuthn attestationObject into its format, authenticator data and statement. */
export function decodeAttestationObject(attestationObject: Uint8Array): {
  fmt: string;
  authDataRaw: Uint8Array;
  stmt: AttestationStatement;
} {
  let obj: CborValue;
  try {
    obj = decodeCbor(attestationObject);
  } catch (err) {
    throw new WebAuthnError("attestation-format", `attestationObject: ${String(err)}`);
  }
  if (!(obj instanceof Map)) {
    throw new WebAuthnError("attestation-format", "attestationObject is not a map");
  }
  const fmt = obj.get("fmt");
  const authData = obj.get("authData");
  const att = obj.get("attStmt");
  if (typeof fmt !== "string" || !(authData instanceof Uint8Array) || !(att instanceof Map)) {
    throw new WebAuthnError("attestation-format", "attestationObject lacks fmt/authData/attStmt");
  }
  const sig = att.get("sig");
  const alg = att.get("alg");
  const x5c = att.get("x5c");
  const ver = att.get("ver");
  const certInfo = att.get("certInfo");
  const pubArea = att.get("pubArea");
  const certs: Uint8Array[] = [];
  if (Array.isArray(x5c)) {
    for (const c of x5c) {
      if (!(c instanceof Uint8Array)) {
        throw new WebAuthnError("attestation-format", "x5c entries must be byte strings");
      }
      certs.push(c);
    }
  }
  return {
    fmt,
    authDataRaw: authData,
    stmt: {
      alg: typeof alg === "number" ? alg : undefined,
      sig: sig instanceof Uint8Array ? sig : new Uint8Array(),
      x5c: certs,
      ...(typeof ver === "string" ? { ver } : {}),
      ...(certInfo instanceof Uint8Array ? { certInfo } : {}),
      ...(pubArea instanceof Uint8Array ? { pubArea } : {}),
    },
  };
}

/**
 * Verify a registration (WebAuthn §7.1) under this deployment's rules. The
 * caller supplies the client data hash it computed itself from the
 * clientDataJSON it issued (see `verifyClientData`).
 */
export function verifyRegistration(params: {
  rpId: string;
  clientDataHash: Uint8Array;
  fmt: string;
  authDataRaw: Uint8Array;
  stmt: AttestationStatement;
  /** The credential id the transport reported separately, if any; must match the attested one. */
  credentialId?: Uint8Array;
  policy: AttestationPolicy;
  /**
   * The vendor roots platform formats chain to; the pinned roots unless a
   * caller passes others (the verification vectors' test roots).
   */
  roots?: VendorRoots;
  /** The hardware key models packed attestations chain to; the pinned set unless a caller passes others (tests). */
  packedTrust?: PackedTrust;
}): RegistrationResult {
  const auth = parseAuthenticatorData(params.authDataRaw);
  checkRpAndFlags(auth, params.rpId);
  if (!auth.attested) {
    throw new WebAuthnError("no-attested-credential", "registration carries no credential (AT=0)");
  }
  if (params.credentialId && !equalBytes(params.credentialId, auth.attested.credentialId)) {
    throw new WebAuthnError(
      "credential-id-mismatch",
      "reported credential id differs from the attested one",
    );
  }
  const platform = PLATFORM_FORMATS.find((f) => f === params.fmt);
  if (params.fmt !== "packed" && !platform) {
    throw new WebAuthnError(
      params.fmt === "none" ? "attestation-missing" : "attestation-format",
      `attestation format "${params.fmt}" is not accepted (packed with a certificate, tpm, apple or android-key only)`,
    );
  }
  const attestation = platform
    ? verifyPlatformStatement(platform, {
        authDataRaw: params.authDataRaw,
        clientDataHash: params.clientDataHash,
        aaguid: auth.attested.aaguid,
        credentialPublicKey: auth.attested.publicKey,
        stmt: params.stmt,
        policy: params.policy,
        roots: params.roots ?? pinnedVendorRoots(),
      })
    : verifyPackedAttestation({
        authDataRaw: params.authDataRaw,
        clientDataHash: params.clientDataHash,
        aaguid: auth.attested.aaguid,
        stmt: params.stmt,
        policy: params.policy,
        ...(params.packedTrust ? { trust: params.packedTrust } : {}),
      });
  return {
    credentialId: auth.attested.credentialId,
    publicKey: auth.attested.publicKey,
    signCount: auth.signCount,
    aaguid: auth.attested.aaguid,
    attestation,
  };
}

export type AssertionResult = { signCount: number; flags: AuthenticatorFlags };

/** How an assertion's signature counter is judged: strictly increasing, or the TPM exemption. */
export type CounterPolicy = "strict" | "tpm-non-exportable";

/** What enrollment keeps to prove the TPM counter exemption later: the registration itself. */
export type TpmCounterEvidence = { attestationObject: string; clientDataHash: string };

/**
 * Does the stored registration evidence prove, for THIS credential, a key generated in and fixed
 * to a TPM (a "tpm" statement chained to the pinned Microsoft TPM root, fixedTPM, fixedParent,
 * sensitiveDataOrigin, attested name over the public area)? Re-verified at its enrollment time
 * on every use, so a store edited to claim the exemption without that statement gets the strict
 * counter rule's refusal. False on anything else.
 */
export function tpmCounterExemptionHolds(p: {
  rpId: string;
  credentialId: Uint8Array;
  publicKeyCose: Uint8Array;
  evidence: TpmCounterEvidence | undefined;
  enrolledAt: number;
  roots?: VendorRoots;
}): boolean {
  if (!p.evidence) {
    return false;
  }
  try {
    const att = decodeAttestationObject(fromB64url(p.evidence.attestationObject));
    if (att.fmt !== "tpm") {
      return false;
    }
    const reg = verifyRegistration({
      rpId: p.rpId,
      clientDataHash: fromB64url(p.evidence.clientDataHash),
      fmt: att.fmt,
      authDataRaw: att.authDataRaw,
      stmt: att.stmt,
      credentialId: p.credentialId,
      policy: { allowedAuthenticators: [], now: p.enrolledAt },
      ...(p.roots ? { roots: p.roots } : {}),
    });
    return (
      reg.attestation.fmt === "tpm" &&
      Buffer.from(reg.publicKey.cose).equals(Buffer.from(p.publicKeyCose))
    );
  } catch {
    return false;
  }
}

/**
 * What enrollment keeps of a "packed" registration, so every use can verify
 * it again: the authenticator data, the client data hash, and the statement.
 */
export type PackedEnrollmentEvidence = {
  authData: string;
  clientDataHash: string;
  sig: string;
  x5c: string[];
  alg?: number;
};

/**
 * Does the stored packed registration still prove, for THIS credential, a
 * recognized hardware security key whose attestation chains to that model's
 * pinned root (verified as at its enrollment time)? False when there is no
 * evidence (an enrollment from before Enclawed 2.0.3 kept none), when it was
 * a software or virtual authenticator, or when the store was edited.
 */
export function packedEnrollmentHolds(p: {
  rpId: string;
  credentialId: Uint8Array;
  publicKeyCose: Uint8Array;
  evidence: PackedEnrollmentEvidence | undefined;
  enrolledAt: number;
  packedTrust?: PackedTrust;
}): boolean {
  if (!p.evidence) {
    return false;
  }
  try {
    const reg = verifyRegistration({
      rpId: p.rpId,
      clientDataHash: fromB64url(p.evidence.clientDataHash),
      fmt: "packed",
      authDataRaw: fromB64url(p.evidence.authData),
      stmt: {
        sig: fromB64url(p.evidence.sig),
        x5c: p.evidence.x5c.map(fromB64url),
        ...(typeof p.evidence.alg === "number" ? { alg: p.evidence.alg } : {}),
      },
      credentialId: p.credentialId,
      policy: { allowedAuthenticators: [], now: p.enrolledAt },
      ...(p.packedTrust ? { packedTrust: p.packedTrust } : {}),
    });
    return (
      reg.attestation.fmt === "packed" &&
      Buffer.from(reg.publicKey.cose).equals(Buffer.from(p.publicKeyCose))
    );
  } catch {
    return false;
  }
}

/**
 * Everything in an assertion check except the counter: rpIdHash, UP and UV,
 * not backup-eligible, no attested data, and the signature over
 * authData || clientDataHash. Used on its own only to re-check an assertion
 * whose counter was already accepted once (a signed unlock ticket).
 */
export function verifySignedAssertion(params: {
  rpId: string;
  clientDataHash: Uint8Array;
  authDataRaw: Uint8Array;
  signature: Uint8Array;
  credentialPublicKey: Uint8Array;
}): ParsedAuthenticatorData {
  const auth = parseAuthenticatorData(params.authDataRaw);
  checkRpAndFlags(auth, params.rpId);
  if (auth.attested) {
    throw new WebAuthnError("bad-authdata", "an assertion must not carry attested credential data");
  }
  const pub = coseToPublicKey(params.credentialPublicKey);
  const signed = Buffer.concat([params.authDataRaw, params.clientDataHash]);
  if (!verifyWithCredentialKey(pub, signed, params.signature)) {
    throw new WebAuthnError("bad-signature", "assertion signature does not verify");
  }
  return auth;
}

/**
 * Verify an assertion (WebAuthn §7.2) under this deployment's rules: rpIdHash,
 * UP and UV, not backup-eligible, the signature over authData || clientDataHash,
 * and a strictly increasing signature counter.
 */
export function verifyAssertion(params: {
  rpId: string;
  clientDataHash: Uint8Array;
  authDataRaw: Uint8Array;
  signature: Uint8Array;
  credentialPublicKey: Uint8Array;
  storedSignCount: number;
  /**
   * "tpm-non-exportable": the caller verified (tpmCounterExemptionHolds) that the credential's
   * registration proved a key the TPM made and cannot export, so a counter that stays at 0 is
   * accepted. Once the counter has moved, it must strictly increase like any other.
   */
  counterPolicy?: CounterPolicy;
}): AssertionResult {
  const auth = verifySignedAssertion(params);
  if (
    params.counterPolicy === "tpm-non-exportable" &&
    auth.signCount === 0 &&
    params.storedSignCount === 0
  ) {
    return { signCount: 0, flags: auth.flags };
  }
  if (auth.signCount === 0 && params.storedSignCount === 0) {
    throw new WebAuthnError(
      "counter-unsupported",
      "the authenticator does not keep a signature counter; clone detection needs one",
    );
  }
  if (auth.signCount <= params.storedSignCount) {
    throw new WebAuthnError(
      "counter-regressed",
      `signature counter ${auth.signCount} did not increase past ${params.storedSignCount}: possible cloned authenticator or replay`,
    );
  }
  return { signCount: auth.signCount, flags: auth.flags };
}
