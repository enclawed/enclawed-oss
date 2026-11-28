// `enclawed/framework` — the SDK surface for *applications* built on top of
// the enclawed framework (as opposed to *plugins*, which use
// `enclawed/plugin-sdk/*`).
//
// An "application" here means a long-running, hermetic Node program that
// calls bootstrapEnclawed() and then drives the SkillGate / broker / audit
// trail itself — for example, the bundled executive assistant demo at
// `enclawed-apps/executive-assistant/`. The intent of this subpath is to give such apps a
// single, stable import line for the primitives they need without
// promoting every internal `src/enclawed/*` symbol to the public root.
//
// Add a re-export here only when an application genuinely needs it.
// Anything that's purely internal to the CLI, the channel runtime, or
// the plugin loader stays off this surface.

// ─── Bootstrap + runtime ────────────────────────────────────────────────
export { bootstrapEnclawed } from "./enclawed/bootstrap.js";
export { setRuntime, clearRuntime } from "./enclawed/runtime.js";

// Apps close their hardware-accredited session on shutdown so an
// ordinary stop is not mistaken for an interrupted accredited session
// at the next boot.
export {
  closeHardwareRootSession,
  // Exposed so the installer's recovery command can clear a DIRTY latch.
  // The guard still does every check; this only lets a tool outside the
  // agent process reach it, which boot() cannot do while DIRTY.
  recoverHardwareRootStandalone,
  // Graceful-exit paths (SIGINT/SIGTERM handlers included) await this: the device's clean close
  // is the only thing that disarms its dirty-on-start latch.
  closeHardwareRootSessionAsync,
  hardwareRootStatusStandalone,
} from "./enclawed/hardware-root/index.js";
// `enclawed hardware-root status|recover`, shared with the installer and codenclawed.
export {
  hardwareRootRecoverCli,
  hardwareRootStatusCli,
  typedSerialUid,
} from "./enclawed/hardware-root/recover-cli.js";
// The status diagnosis as data (what `enclawed hardware-root status --json` prints).
export {
  diagnoseHardwareRoot,
  renderHardwareRootDiagnosis,
  type HardwareRootDiagnosis,
} from "./enclawed/hardware-root/status-report.js";
export type { RecoveryAuth } from "./enclawed/hardware-root/guard.js";
// `enclawed hardware-root wsl-setup`: automatic WSL USB access to the Enclaweder, shared with
// the installers.
export { isWslHost, wslUsbSetupCli } from "./enclawed/platform/wsl-usb-cli.js";

// ─── Audit log ──────────────────────────────────────────────────────────
export { AuditLogger, verifyChain } from "./enclawed/audit-log.js";

// ─── Policy + classification ────────────────────────────────────────────
export { createPolicy, defaultOpenPolicy } from "./enclawed/policy.js";
export { makeLabel } from "./enclawed/classification.js";
export type { Label } from "./enclawed/classification.js";

// ─── Skill gate + manifest + capability vocabulary ──────────────────────
export { SkillGate } from "./enclawed/skill-gate.js";
export type { GateOutcome } from "./enclawed/skill-gate.js";
export { VERIFICATION } from "./enclawed/skill-manifest.js";
export type { SkillManifest } from "./enclawed/skill-manifest.js";
export { CAPABILITY, makeCall, makeEgressCall } from "./enclawed/skill-capabilities.js";
export type { CapabilityCall, CapabilityToken } from "./enclawed/skill-capabilities.js";
// net.egress targets as destination profiles (scheme, host, port, request shape).
export {
  canonicalEgressTarget,
  egressTargetDestination,
  egressTargetString,
  parseEgressTarget,
  urlWithinEgressTarget,
  type EgressTarget,
} from "./enclawed/egress-target.js";
export type { Broker, BrokerDecision, BrokerRequest } from "./enclawed/skill-broker.js";

// ─── Cross-cutting policy modules ───────────────────────────────────────
export { scan as dlpScan, redact as dlpRedact } from "./enclawed/dlp-scanner.js";
export type { Finding as DlpFinding } from "./enclawed/dlp-scanner.js";
export {
  installEgressGuard,
  installRawSocketGuard,
  EgressDeniedError,
} from "./enclawed/egress-guard.js";
export {
  generateEd25519KeyPair,
  signManifest,
  verifyManifestSignature,
} from "./enclawed/module-signing.js";

// ─── Tool-call gate, write history and audit verification ───────────────
// For applications that gate another agent's tool calls from outside its
// process (for example a hook handler run once per call): the hardware halt,
// the policy loader the gateway uses, per-call reversibility of file writes,
// the local write history, and verification of the hash-chained audit log.
export { bootHardwareRoot, hardwareRootInfo } from "./enclawed/hardware-root/index.js";
// Owner/client sharing of the machine's hardware root: a long-lived process
// owns the devices, short-lived ones read its cached health over the socket.
export {
  brokerDisabled,
  brokerSocketPath,
  connectRoot,
  RootAttestError,
  RootHaltError,
  // A separate process (a hook) checks the devices' own signed answers itself (H1, H15).
  verifyRootAttestation,
  verifyRootMembers,
} from "./enclawed/hardware-root/broker.js";
export type {
  RemoteAttestation,
  RemoteRoot,
  RootHealth,
  VerifiedMember,
} from "./enclawed/hardware-root/broker.js";
// Every member's latch read, device-signed over the caller's nonce (findings H1, H15).
export { attestHardwareRoot } from "./enclawed/hardware-root/index.js";
// Forensic snapshots chained into the device-anchored audit log, and their verifier (H13).
export { setForensicAuditSink, verifyForensicLog } from "./enclawed/hardware-root/index.js";
// The framework refuses a real device under a test runner without this opt-in.
export {
  LIVE_DEVICE_TEST_ACK,
  LIVE_DEVICE_TEST_ENV,
  underTestRunner,
} from "./enclawed/hardware-root/test-guard.js";
// Device-backed evidence for an application that keeps its own audit log
// (for example a hook handler run once per tool call, with a long-lived
// launcher that holds the root): the bound device for a fresh
// challenge-response, the head anchor attested by the device's monotonic
// counter, and the verifiers a separate process needs to check a device's
// answers itself against the pinned manufacturer roots.
export { hardwareRootSigningDevice } from "./enclawed/hardware-root/index.js";
// Command set 0.5: launch activations, the bound anchor and activation-gated key derivation.
export {
  hardwareRootCommandSet,
  hardwareRootKeyDerivation,
} from "./enclawed/hardware-root/index.js";
export {
  type ActivationFacts,
  bindingNames,
  type CommandSetProof,
  CS05_REFLASH_RUNBOOK,
  proveCommandSet05,
  deviceFactorActivations,
  type FreshAnchorRead,
  parseBinding,
  verifyAnchorRead,
} from "./enclawed/hardware-root/activation.js";
export {
  deriveDeviceKey,
  KEY_DERIVE_RESIDUAL,
  type KeyDeriveResult,
} from "./enclawed/hardware-root/key-derive.js";
// Device-verified authenticator codes: the bound device checks a code (it holds the secret,
// this host never does) and signs its verdict over a nonce the application chose; the record
// it returns can be checked again later, offline, against that device's key.
export { hardwareRootTotpDevice } from "./enclawed/hardware-root/index.js";
// The session's audit anchor, decided by the kit: the bound device, or the authenticated anchor
// session relayed through the machine's owner; a bound session that cannot anchor with
// authentication is refused. And the audit verdict for a log whose launches held the root.
export {
  hardwareRootSessionAnchor,
  requireHardwareRootSessionAnchor,
} from "./enclawed/hardware-root/index.js";
export {
  SessionAnchorRefused,
  decideSessionAnchor,
} from "./enclawed/hardware-root/session-anchor.js";
export type { SessionAnchorDecision } from "./enclawed/hardware-root/session-anchor.js";
export {
  boundAnchorRefusal,
  decideAuditAnchorVerdict,
  deviceFactorActivationsInFiles,
  launchRootClaims,
  launchRootClaimsInFiles,
} from "./enclawed/hardware-root/audit-anchor-verdict.js";
// The audit anchor's history (records v1, v2 and v3, each line exactly as the device signed it)
// and the device comparison of a log as found, for `audit verify` and a launcher's anchor gate.
export {
  anchorFilePath,
  anchorHistoryLine,
  anchorHistoryPath,
  appendAnchorHistory,
  compareAnchoredLog,
  FIRMWARE_NO_ANCHOR,
  parseAnchorHistory,
  readAnchorHistory,
  unboundHistoryRecord,
  verifyAnchorFileRecord,
  verifySignedAnchorRecord,
} from "./enclawed/hardware-root/anchor-history.js";
export type {
  AnchorComparison,
  AnchorComparisonStatus,
  AnchorHistory,
  VerifiedAnchorRecord,
} from "./enclawed/hardware-root/anchor-history.js";
export {
  deviceTotpEnrolled,
  deviceTotpVerdict,
  verifyVerdictRecord,
} from "./enclawed/hardware-root/totp-verify.js";
export type {
  DeviceTotpAccess,
  DeviceTotpFailure,
  DeviceTotpVerdict,
  TotpPurpose,
  VerdictRecord,
} from "./enclawed/hardware-root/totp-verify.js";
// Operations the person authorises with their device-verified factors: taking over a session a
// squatter holds, an unlock budget the device counts (each use a receipt the device signs over the
// verifier's nonce), the device's signed identity history, and sealing a code to the device so a
// relaying process cannot read or reuse it.
export {
  FactorError,
  grantUnlock,
  identityFingerprint,
  openSeal,
  parseIdentityLog,
  parseUnlockBody,
  readDeviceEntropy,
  readIdentityLog,
  readUnlock,
  revokeUnlock,
  sealedTotpVerdict,
  sealFrame,
  spendUnlock,
  takeoverByFactors,
  takeoverFidoChallenge,
  TakenSession,
  verifyUnlockReceipt,
} from "./enclawed/hardware-root/device-factors.js";
export type {
  FactorFailure,
  FactorTransport,
  IdentityEvent,
  OpenSeal,
  SealRelay,
  TakeoverChannel,
  UnlockBody,
  UnlockRecord,
} from "./enclawed/hardware-root/device-factors.js";
export { enclawederHeadAnchor, HeadAnchorTampered } from "./enclawed/hardware-root/head-anchor.js";
export {
  verifyAnchor,
  verifyCert,
  verifyChallenge,
} from "./enclawed/hardware-root/enclaweder-hid.js";
// Authenticated audit anchoring (record v2): the sink opens one anchor session per process
// and raises HeadAnchorAlarm (closed `code`) when another holder is detected.
export { closeHeadAnchorSessions, HeadAnchorAlarm } from "./enclawed/hardware-root/head-anchor.js";
export type {
  AnchorCapableDevice,
  AnchorSessionHandle,
  HeadAnchorAlarmCode,
  HeadAnchorTamperCode,
} from "./enclawed/hardware-root/head-anchor.js";
export {
  ANCHOR_KEEPALIVE_INTERVAL_MS,
  ANCHOR_LEASE_MS,
  ANCHOR_OPEN_TIMEOUT_MS,
  ANCHOR_STATUS,
  AnchorAuthError,
  AnchorSession,
  busyWaitMs,
  parseAnchor,
  verifyAnchorRecord,
  verifyAnchorV2,
} from "./enclawed/hardware-root/enclaweder-hid.js";
export type {
  AnchorErrorCode,
  AnchorOp,
  AnchorResponse,
  OperatorSigner,
} from "./enclawed/hardware-root/enclaweder-hid.js";
export { checkHardwareRootForToolCall } from "./enclawed/agent-tool-guard.js";
export type { HardwareGateDecision, HardwareHaltCode } from "./enclawed/agent-tool-guard.js";
export { verifyHistory } from "./enclawed/audit-log.js";
export type { ChainVerifyResult, HistoryVerifyResult } from "./enclawed/audit-log.js";
export { defaultEnclavedPolicy } from "./enclawed/policy.js";
export type { Policy, HistoryPolicy } from "./enclawed/policy.js";
export { loadPolicyFromJson } from "./enclawed/policy-loader.js";
export { getFlavor } from "./enclawed/flavor.js";
export type { Flavor } from "./enclawed/flavor.js";
export { resolveDefaultConfigPath } from "./infra/workspace-dir.js";
export { prepareFsWriteHistory } from "./enclawed/fs-reversibility.js";
export type {
  FsHistoryOutcome,
  FsTargetResult,
  FsWriteTarget,
} from "./enclawed/fs-reversibility.js";
export { HistoryStore, HistoryTamperedError, resolveHistoryDir } from "./enclawed/history-store.js";
export type { HistoryEntry } from "./enclawed/history-store.js";
export { restoreSnapshot, RestoreError } from "./enclawed/history-restore.js";
export type { RestoreResult } from "./enclawed/history-restore.js";

// ─── MCP tool pins, approval grants, resource identity ──────────────────
// The canonical implementations of three call-time protections, for an
// application that admits MCP servers or asks a person to approve actions
// itself (for example a hook-based guard for another agent):
//   - MCP tool-definition pins: pin every tool definition at admission
//     (SHA-256 of its canonical JSON), check every later tools/list answer,
//     refuse tools whose definition drifted ("rug pull");
//   - approval grants: single use, bound to the tool, the exact arguments
//     and the resolved resources, expiring with the request;
//   - resource identity: what a path or URL designates now, re-resolved at
//     execution and compared with what was approved.
export {
  canonicalJson,
  checkMcpToolDefinitions,
  describeMcpToolDrift,
  McpToolPinSet,
  mcpToolDefinitionDigest,
  pinMcpToolDefinitions,
} from "./enclawed/mcp-tool-pins.js";
export type {
  McpToolCallDecision,
  McpToolDrift,
  McpToolDriftCode,
  McpToolPins,
} from "./enclawed/mcp-tool-pins.js";
export {
  ApprovalGrantLedger,
  approvalArgsDigest,
  describeResourceChange,
  resolveFsResource,
  resolveUrlResource,
} from "./enclawed/approval-binding.js";
export type {
  ApprovalConsumeResult,
  ApprovalGrant,
  ApprovalRefusalCode,
  ApprovalSubject,
  FsResourceIdentity,
  ResourceIdentity,
  UrlResourceIdentity,
} from "./enclawed/approval-binding.js";

// ─── Bundled bridges ────────────────────────────────────────────────────
// Re-exported so an application can `import { loadGoogleWorkspaceBridge,
// QClearedMcpClient } from "enclawed/framework"` without dragging in a
// second package dependency. The bridges themselves live under
// `extensions/` because they are also loadable as enclaved plugins; this
// subpath is the application-facing seam.
//
// Imported by PACKAGE NAME, not by relative path into extensions/src. src
// reaching into an extension's files couples this module to that package's
// internal layout, which is what the src-extension import boundary exists to
// prevent; going through each bridge's public entry keeps the seam at the
// package surface where it can actually be held stable.
export { QClearedMcpClient, HttpJsonRpcTransport, registerServer } from "@enclawed/mcp-attested";
export type { JsonRpcResult, McpTransport } from "@enclawed/mcp-attested";
export {
  GOOGLE_WORKSPACE_ENDPOINTS,
  loadGoogleWorkspaceBridge,
} from "@enclawed/mcp-google-workspace";
export type { GoogleWorkspaceService } from "@enclawed/mcp-google-workspace";
export { IMAP_SMTP_TOOLS, loadImapSmtpBridge } from "@enclawed/mcp-imap-smtp";
export { CALDAV_TOOLS, loadCalDavBridge } from "@enclawed/mcp-caldav";
export { CARDDAV_TOOLS, loadCardDavBridge } from "@enclawed/mcp-carddav";

// ─── Covert-channel egress pipeline ─────────────────────────────────────
// The stage pipeline the egress-mediator plugin runs at the gateway's
// chokepoints, exposed so an application with its own chokepoints can run
// the same stages on tool-call arguments and model input (for example a
// Claude Code PostToolUse hook rewriting `updatedToolOutput`):
//
//   const run = createEgressRunner({
//     stages: [buildCanonicalizerStage(), buildTaintTrackerStage()],
//   });
//   const r = await run(text, { kind: "model-input", id: "claude-code" });
//   // r.cancelled ? withhold : use r.content
//
// Imported by package name, like the bridges above.
export {
  createEgressRunner,
  createLedgerStore as createEgressLedgerStore,
  DEFAULT_STAGE_MODES as EGRESS_DEFAULT_STAGE_MODES,
  getEgressStages,
  registerEgressStage,
  resolveStageMode as resolveEgressStageMode,
  runEgressPipeline,
  STAGE_IDS as EGRESS_STAGE_IDS,
  // Action batcher (choice-type channels): canonical order, idempotent
  // repeat collapse, constant-set padding for a chokepoint the app owns.
  createActionBatcher,
  resolveActionBatcherOptions,
  classifyActionIdempotency,
  // Media egress: scramble and canonically order a batch of decoded images
  // and audio at a media chokepoint the app owns.
  mediateMediaBatch,
} from "@enclawed/egress-core";
export type {
  EgressConfig,
  EgressDecision,
  EgressMode,
  EgressRunner,
  EgressRunnerOptions,
  EgressSink,
  EgressSinkKind,
  EgressStage,
  Finding as EgressFinding,
  PipelineResult as EgressPipelineResult,
  ActionBatcher as EgressActionBatcher,
  ActionBatcherOptions as EgressActionBatcherOptions,
  ActionRelease as EgressActionRelease,
  EgressAction,
} from "@enclawed/egress-core";
export { buildCanonicalizerStage } from "@enclawed/egress-canonicalizer/api.js";
export { buildTaintTrackerStage, createTaintStore } from "@enclawed/egress-taint-tracker/api.js";
// Taint tagging: mark a value as sensitive so the taint-tracker stage blocks
// any egress payload that carries it (enforce mode), at every chokepoint, in
// the gateway and in an app's own pipeline alike. The store is process-wide.
//
//   tagSensitiveValue(canarySecret, { label: "session-canary" }); // every sink
//   tagSensitiveValue(apiKey, { scope: conversationId });         // one conversation
export {
  sharedTaintStore,
  tagSensitiveValue,
  TAINT_SCOPE_ALL,
} from "@enclawed/egress-taint-tracker/api.js";
export type {
  TagSensitiveValueOptions,
  TaintCheck,
  TaintStore,
} from "@enclawed/egress-taint-tracker/api.js";
export { buildEntropyScannerStage } from "@enclawed/egress-entropy-scanner/api.js";
export { buildReplaySentinelStage } from "@enclawed/egress-replay-sentinel/api.js";
export { buildNoiseInjectorStage } from "@enclawed/egress-noise-injector/api.js";
export { buildSemanticScramblerStage } from "@enclawed/egress-semantic-scrambler/api.js";
export { buildTimingScramblerStage } from "@enclawed/egress-timing-scrambler/api.js";
export { buildBehavioralInvariantsStage } from "@enclawed/egress-behavioral-invariants/api.js";

// ─── Mandatory second factor ────────────────────────────────────────────
// Applications that gate their own sessions or sensitive commands (for
// example an app that launches another agent, or the installer's recovery)
// use the same gate as the CLI: a roaming FIDO2 security key or a
// device-bound platform passkey (Windows Hello on a TPM, Apple's or
// Android's secure hardware; attested, never synced), UV and UP on every
// assertion, strict counters (a verified non-exportable TPM key excepted),
// audited outcomes, unlock tickets for headless starts. An app passes its
// own state dir, relying party id and audit sink when it keeps its own; the
// passkey ceremony is the gate's own loopback page.
export {
  DEFAULT_RP_ID,
  ENROLL_INSTRUCTIONS,
  SecondFactorError,
  assertSecondFactor,
  enrollPasskey,
  enrollSecurityKey,
  loadAuthConfig,
  parseAuthConfig,
  removeSecurityKey,
  revokeUnlockTicket,
  secondFactorStatus,
  unlockForHeadlessStart,
} from "./enclawed/auth/index.js";
export type {
  AuthAuditSink,
  AuthContext,
  AuthPurpose,
  AuthStatus,
  SecondFactorErrorCode,
  SecondFactorResult,
  UnlockTicket,
} from "./enclawed/auth/index.js";

// Adapter kit: the normalized agent-event contract and the host-agnostic decision
// engine every agent adapter (codenclawed first) calls. Every security decision an
// adapter needs lives here; an adapter only maps its host's hooks, settings and
// process model onto these types. See src/enclawed/adapter/README.md.
export * as adapterKit from "./enclawed/adapter/index.js";

// Containment of what a session launches (MCP servers, project scripts, package
// installs) and the outbound relay for contained processes. Namespaced, like the
// adapter kit, so its names (credentialFindings, CREDENTIAL_PATHS, ...) never
// clash with the framework's own. See src/enclawed/containment/index.ts.
export * as containment from "./enclawed/containment/index.js";
// `enclawed conformance` as a library: the framework's checks, and the same
// invariants run through an agent-CLI adapter's own event mapping.
export {
  renderConformanceReport,
  runConformanceChecks,
  type ConformanceReport,
} from "./enclawed/conformance/index.js";
export {
  ADAPTER_CASE_IDS,
  adapterChecks,
  loadConformanceAdapter,
  type AdapterIntent,
  type AdapterSandbox,
  type ConformanceAdapter,
} from "./enclawed/conformance/checks-adapter.js";
// The per-server call bracket of a containment (Containment.runCall): one tools/call in flight at a time.
export type ContainmentRunCall = import("./enclawed/containment/index.js").Containment["runCall"];
export type { InFlightCall as ContainmentInFlightCall } from "./enclawed/containment/index.js";
