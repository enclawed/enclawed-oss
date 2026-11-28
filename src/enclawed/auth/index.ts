// Mandatory two-factor authentication. See gate.ts for the rule and
// docs/security/two-factor.md for the operator guide.

export {
  CHALLENGE_TTL_MS,
  DEFAULT_RP_ID,
  ENROLL_INSTRUCTIONS,
  SecondFactorError,
  assertSecondFactor,
  enrollPasskey,
  enrollSecurityKey,
  removeSecurityKey,
  revokeUnlockTicket,
  secondFactorStatus,
  unlockForHeadlessStart,
} from "./gate.js";
export type {
  AuthAuditEvent,
  AuthAuditSink,
  AuthContext,
  AuthPurpose,
  AuthStatus,
  DeviceSecondFactor,
  EnrollResult,
  SecondFactorErrorCode,
  SecondFactorResult,
} from "./gate.js";
export { enforceCommandSecondFactor } from "./command-gate.js";
export { GATED_COMMANDS, gatedPurposeForCommand } from "./command-table.js";
export { resolveDeviceSecondFactor } from "./device-factor.js";
export { AuthConfigError, defaultAuthConfig, loadAuthConfig, parseAuthConfig } from "./config.js";
export type { AuthConfig } from "./config.js";
export {
  INSTALL_HINT,
  TransportError,
  createLibfido2Transport,
  deviceRefusal,
  findTool,
  parseDeviceInfo,
  parseDeviceList,
} from "./libfido2.js";
export type { Fido2DeviceInfo, Fido2Transport } from "./libfido2.js";
export { TICKET_DEFAULT_MINUTES, TICKET_HARD_MAX_MINUTES, currentBinding } from "./ticket.js";
export type { UnlockTicket } from "./ticket.js";
export { PasskeyUnavailableError, loopbackPasskeyCeremony } from "./passkey.js";
export type { PasskeyCeremony } from "./passkey.js";
export { CeremonyError, PASSKEY_RP_ID, startLoopbackCeremony } from "./loopback-ceremony.js";
export type { LoopbackCeremonyRequest, LoopbackCeremonyResult } from "./loopback-ceremony.js";
export { openBrowser, probeWslLocalhost } from "./browser-open.js";
export { PINNED_ATTESTATION_ROOTS } from "./attestation-roots.js";
export {
  WebAuthnError,
  coseToPublicKey,
  decodeAttestationObject,
  parseAuthenticatorData,
  verifyAssertion,
  verifyClientData,
  verifyPackedAttestation,
  verifyRegistration,
} from "./webauthn.js";
export type { AllowedAuthenticator, AttestationPolicy, WebAuthnErrorCode } from "./webauthn.js";
