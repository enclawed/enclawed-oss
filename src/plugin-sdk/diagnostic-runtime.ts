// Diagnostic flag/event helpers for plugins that want narrow runtime gating.

export { isDiagnosticFlagEnabled } from "../infra/diagnostic-flags.js";
export { isDiagnosticsEnabled } from "../infra/diagnostic-events.js";
export type { DiagnosticEventPayload } from "../infra/diagnostic-events.js";
export type { DiagnosticEventMetadata } from "../plugins/types.js";
