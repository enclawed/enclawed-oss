// `enclawed/framework` — the SDK surface for *applications* built on top of
// the enclawed framework (as opposed to *plugins*, which use
// `enclawed/plugin-sdk/*`).
//
// An "application" here means a long-running, hermetic Node program that
// calls bootstrapEnclawed() and then drives the SkillGate / broker / audit
// trail itself — for example, the bundled secretary demo at
// `enclawed-apps/secretary/`. The intent of this subpath is to give such apps a
// single, stable import line for the primitives they need without
// promoting every internal `src/enclawed/*` symbol to the public root.
//
// Add a re-export here only when an application genuinely needs it.
// Anything that's purely internal to the CLI, the channel runtime, or
// the plugin loader stays off this surface.

// ─── Bootstrap + runtime ────────────────────────────────────────────────
export { bootstrapEnclawed } from "./enclawed/bootstrap.js";
export { setRuntime, clearRuntime } from "./enclawed/runtime.js";

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
export { CAPABILITY, makeCall } from "./enclawed/skill-capabilities.js";
export type { CapabilityCall, CapabilityToken } from "./enclawed/skill-capabilities.js";
export type { Broker, BrokerDecision, BrokerRequest } from "./enclawed/skill-broker.js";

// ─── Cross-cutting policy modules ───────────────────────────────────────
export { scan as dlpScan } from "./enclawed/dlp-scanner.js";
export type { Finding as DlpFinding } from "./enclawed/dlp-scanner.js";
export { installEgressGuard, EgressDeniedError } from "./enclawed/egress-guard.js";
export {
  generateEd25519KeyPair,
  signManifest,
  verifyManifestSignature,
} from "./enclawed/module-signing.js";

// ─── Bundled bridges ────────────────────────────────────────────────────
// Re-exported so an application can `import { loadGoogleWorkspaceBridge,
// QClearedMcpClient } from "enclawed/framework"` without dragging in a
// second package dependency. The bridges themselves live under
// `extensions/` because they are also loadable as enclaved plugins; this
// subpath is the application-facing seam.
export {
  QClearedMcpClient,
  HttpJsonRpcTransport,
  registerServer,
} from "../extensions/mcp-attested/src/index.js";
export type { JsonRpcResult, McpTransport } from "../extensions/mcp-attested/src/index.js";
export {
  GOOGLE_WORKSPACE_ENDPOINTS,
  loadGoogleWorkspaceBridge,
} from "../extensions/mcp-google-workspace/src/index.js";
export type { GoogleWorkspaceService } from "../extensions/mcp-google-workspace/src/index.js";
export { IMAP_SMTP_TOOLS, loadImapSmtpBridge } from "../extensions/mcp-imap-smtp/src/index.js";
export { CALDAV_TOOLS, loadCalDavBridge } from "../extensions/mcp-caldav/src/index.js";
export { CARDDAV_TOOLS, loadCardDavBridge } from "../extensions/mcp-carddav/src/index.js";
