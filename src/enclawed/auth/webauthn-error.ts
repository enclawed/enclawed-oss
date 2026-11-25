// The error every WebAuthn verification step throws, with a closed code.

export type WebAuthnErrorCode =
  | "bad-authdata"
  | "bad-client-data"
  | "type-mismatch"
  | "challenge-mismatch"
  | "origin-mismatch"
  | "client-data-hash-mismatch"
  | "rp-mismatch"
  | "no-user-presence"
  | "no-user-verification"
  | "backup-eligible"
  | "no-attested-credential"
  | "credential-id-mismatch"
  | "unsupported-alg"
  | "bad-public-key"
  | "bad-signature"
  | "counter-regressed"
  | "counter-unsupported"
  | "attestation-format"
  | "attestation-missing"
  | "attestation-invalid"
  | "attestation-not-allowed"
  | "zero-aaguid";

export class WebAuthnError extends Error {
  constructor(
    readonly code: WebAuthnErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WebAuthnError";
  }
}
