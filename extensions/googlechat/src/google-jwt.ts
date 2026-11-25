import crypto from "node:crypto";

// Google-signed JWT handling with node:crypto only. Replaces google-auth-library's
// OAuth2Client.verifySignedJwtWithCertsAsync (inbound verification) and gtoken's
// RS256 assertion signer (outbound service-account grant). Verification matches
// the library's checks (kid lookup, signature, iat/exp presence, 1-day max
// lifetime, 300 s clock skew, issuer list, exact audience) and adds stricter
// ones: alg must be RS256, the key must be RSA, segments must be strict
// base64url, `crit` headers and non-numeric times are refused, and `nbf` is
// enforced with the same skew.

/** Same skew google-auth-library uses (OAuth2Client.CLOCK_SKEW_SECS_). */
export const GOOGLE_JWT_CLOCK_SKEW_SECS = 300;
/** Same default as OAuth2Client.DEFAULT_MAX_TOKEN_LIFETIME_SECS_. */
export const GOOGLE_JWT_MAX_LIFETIME_SECS = 86_400;
/** Google ID tokens are ~1 KiB; anything this large is not a token we issue or accept. */
const MAX_JWT_LENGTH = 16 * 1024;
const BASE64URL_SEGMENT = /^[A-Za-z0-9_-]+$/;

export type GoogleJwtPayload = Record<string, unknown> & {
  aud?: unknown;
  email?: unknown;
  email_verified?: unknown;
  exp?: unknown;
  iat?: unknown;
  iss?: unknown;
  nbf?: unknown;
  sub?: unknown;
};

export type VerifiedGoogleJwt = {
  header: Record<string, unknown>;
  payload: GoogleJwtPayload;
};

function base64UrlEncode(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function decodeSegment(segment: string, label: string): Buffer {
  if (!BASE64URL_SEGMENT.test(segment)) {
    throw new Error(`Malformed token ${label} segment`);
  }
  const decoded = Buffer.from(segment, "base64url");
  // Round-trip guard: Buffer decoding is lenient, so reject anything that does
  // not re-encode to the exact input (non-canonical trailing bits).
  if (decoded.toString("base64url") !== segment) {
    throw new Error(`Malformed token ${label} segment`);
  }
  return decoded;
}

function decodeJsonObject(segment: string, label: string): Record<string, unknown> {
  const raw = decodeSegment(segment, label).toString("utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Can't parse token ${label}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Can't parse token ${label}`);
  }
  return parsed as Record<string, unknown>;
}

function readNumericDate(payload: GoogleJwtPayload, field: "exp" | "iat" | "nbf"): number {
  const value = payload[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} field using invalid format`);
  }
  return value;
}

function loadRsaPublicKey(certOrKey: string): crypto.KeyObject {
  let key: crypto.KeyObject;
  try {
    key = crypto.createPublicKey(certOrKey);
  } catch {
    throw new Error("Invalid verification certificate");
  }
  if (key.asymmetricKeyType !== "rsa") {
    throw new Error("Verification certificate is not an RSA key");
  }
  return key;
}

/**
 * Verify a Google-signed RS256 JWT against a `kid -> PEM certificate` map.
 * Throws on every failure; never returns an unverified payload. Error messages
 * never echo the token itself.
 */
export function verifyGoogleSignedJwt(params: {
  jwt: string;
  certs: Record<string, string>;
  audience: string;
  issuers: readonly string[];
  nowMs?: number;
}): VerifiedGoogleJwt {
  const { jwt, certs, audience, issuers } = params;
  if (typeof jwt !== "string" || jwt.length === 0 || jwt.length > MAX_JWT_LENGTH) {
    throw new Error("Malformed token");
  }
  if (typeof audience !== "string" || audience.length === 0) {
    throw new Error("Missing required audience");
  }
  if (issuers.length === 0) {
    throw new Error("Missing allowed issuers");
  }
  const segments = jwt.split(".");
  if (segments.length !== 3) {
    throw new Error("Wrong number of segments in token");
  }
  const [headerSegment, payloadSegment, signatureSegment] = segments as [string, string, string];
  const header = decodeJsonObject(headerSegment, "envelope");
  const payload = decodeJsonObject(payloadSegment, "payload") as GoogleJwtPayload;
  const signature = decodeSegment(signatureSegment, "signature");

  // Only RS256 is accepted: Google signs ID tokens and Chat tokens with RSA.
  // This rejects `none`, HS* (key-confusion) and every other algorithm.
  if (header.alg !== "RS256") {
    throw new Error(`Unsupported token algorithm: ${String(header.alg).slice(0, 32)}`);
  }
  if (Object.prototype.hasOwnProperty.call(header, "crit")) {
    throw new Error("Unsupported critical token header");
  }
  const kid = header.kid;
  if (typeof kid !== "string" || kid.length === 0) {
    throw new Error("Token envelope has no key id");
  }
  if (!Object.prototype.hasOwnProperty.call(certs, kid)) {
    throw new Error("No pem found for envelope");
  }
  const cert = certs[kid];
  if (typeof cert !== "string" || cert.length === 0) {
    throw new Error("No pem found for envelope");
  }
  const publicKey = loadRsaPublicKey(cert);
  const verified = crypto.verify(
    "sha256",
    Buffer.from(`${headerSegment}.${payloadSegment}`, "utf8"),
    { key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING },
    signature,
  );
  if (!verified) {
    throw new Error("Invalid token signature");
  }

  if (payload.iat === undefined || payload.iat === null || payload.iat === 0) {
    throw new Error("No issue time in token");
  }
  if (payload.exp === undefined || payload.exp === null || payload.exp === 0) {
    throw new Error("No expiration time in token");
  }
  const iat = readNumericDate(payload, "iat");
  const exp = readNumericDate(payload, "exp");
  const now = (params.nowMs ?? Date.now()) / 1000;
  if (exp >= now + GOOGLE_JWT_MAX_LIFETIME_SECS) {
    throw new Error("Expiration time too far in future");
  }
  if (now < iat - GOOGLE_JWT_CLOCK_SKEW_SECS) {
    throw new Error("Token used too early");
  }
  if (now > exp + GOOGLE_JWT_CLOCK_SKEW_SECS) {
    throw new Error("Token used too late");
  }
  if (payload.nbf !== undefined) {
    const nbf = readNumericDate(payload, "nbf");
    if (now < nbf - GOOGLE_JWT_CLOCK_SKEW_SECS) {
      throw new Error("Token used too early");
    }
  }
  if (typeof payload.iss !== "string" || !issuers.includes(payload.iss)) {
    throw new Error(`Invalid issuer, expected one of [${issuers.join(",")}]`);
  }
  if (typeof payload.aud !== "string" || payload.aud !== audience) {
    throw new Error("Wrong recipient, payload audience != requiredAudience");
  }
  return { header, payload };
}

/**
 * Build the RFC 7523 JWT-bearer assertion Google's token endpoint expects from
 * a service account: RS256 over `{iss, scope, aud, exp, iat}` with a one-hour
 * lifetime, the same claims and header gtoken produced.
 */
export function createServiceAccountAssertion(params: {
  clientEmail: string;
  privateKey: string;
  scope: string;
  audience: string;
  nowMs?: number;
}): string {
  let key: crypto.KeyObject;
  try {
    key = crypto.createPrivateKey(params.privateKey);
  } catch {
    throw new Error("Google Chat service account private_key is not a valid private key");
  }
  if (key.asymmetricKeyType !== "rsa") {
    throw new Error("Google Chat service account private_key must be an RSA key");
  }
  const iat = Math.floor((params.nowMs ?? Date.now()) / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: params.clientEmail,
      scope: params.scope,
      aud: params.audience,
      exp: iat + 3600,
      iat,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = crypto.sign("sha256", Buffer.from(signingInput, "utf8"), {
    key,
    padding: crypto.constants.RSA_PKCS1_PADDING,
  });
  return `${signingInput}.${base64UrlEncode(signature)}`;
}
