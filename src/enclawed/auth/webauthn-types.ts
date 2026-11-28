// Types shared by the WebAuthn verifier (webauthn.ts) and the platform
// attestation formats (attestation-platform.ts): a leaf, so neither imports
// the other for its types.

import type { KeyObject } from "node:crypto";
import type { PlatformAttestationFormat } from "./attestation-roots.js";

/** COSE algorithms of credential keys: ES256 (-7), EdDSA (-8), RS256 (-257). */
export type CoseAlg = -7 | -8 | -257;

export type CredentialPublicKey = {
  alg: CoseAlg;
  /** The COSE_Key bytes exactly as the authenticator produced them. */
  cose: Uint8Array;
  key: KeyObject;
};

export type AttestationStatement = {
  /** COSE alg of the attestation signature when the statement carries one. */
  alg?: number;
  sig: Uint8Array;
  x5c: Uint8Array[];
  /** "tpm" only: the TPM version, the TPMS_ATTEST and the TPMT_PUBLIC. */
  ver?: string;
  certInfo?: Uint8Array;
  pubArea?: Uint8Array;
};

/** Attestation formats accepted: a security key's "packed", and the device-bound platform formats. */
export type AcceptedAttestationFormat = "packed" | PlatformAttestationFormat;

export type AttestationResult = {
  fmt: AcceptedAttestationFormat;
  /** COSE alg of the attestation signature, when the format signs. */
  alg?: number;
  aaguid: string;
  certSha256: string;
  certSubject: string;
  certIssuer: string;
  /** Description of the allowlist entry the attestation chained to, when an allowlist is configured. */
  allowedAs: string | null;
};
