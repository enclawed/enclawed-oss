import { normalizeLowercaseStringOrEmpty } from "../shared/string-coerce.js";

// Default service labels (canonical + legacy compatibility)
export const GATEWAY_LAUNCH_AGENT_LABEL = "ai.enclawed.gateway";
export const GATEWAY_SYSTEMD_SERVICE_NAME = "enclawed-gateway";
export const GATEWAY_WINDOWS_TASK_NAME = "Enclawed Gateway";
export const GATEWAY_SERVICE_MARKER = "enclawed";
export const GATEWAY_SERVICE_KIND = "gateway";
export const NODE_LAUNCH_AGENT_LABEL = "ai.enclawed.node";
export const NODE_SYSTEMD_SERVICE_NAME = "enclawed-node";
export const NODE_WINDOWS_TASK_NAME = "Enclawed Node";
export const NODE_SERVICE_MARKER = "enclawed";
export const NODE_SERVICE_KIND = "node";
export const NODE_WINDOWS_TASK_SCRIPT_NAME = "node.cmd";
/**
 * Legacy launch-agent labels we still detect during boot so existing
 * registrations from older installs can be discovered. Migration (stop /
 * remove / install with the new label) is NOT performed automatically yet;
 * see the rename sweep follow-up task. For now this is detection-only.
 */
export const LEGACY_GATEWAY_LAUNCH_AGENT_LABELS: string[] = ["ai.openclaw.gateway"];
/**
 * Legacy systemd unit names we still detect during boot. As with the
 * launch-agent labels above, this is detection-only; the operator must run
 * the migration command (TBD follow-up task) to stop the old unit, remove
 * the unit file, and install the new "enclawed-gateway" unit. The
 * pre-existing "clawdbot-gateway" entry stays in this list.
 */
export const LEGACY_GATEWAY_SYSTEMD_SERVICE_NAMES: string[] = [
  "openclaw-gateway",
  "clawdbot-gateway",
];
/**
 * Legacy Windows task names still detected for migration discovery.
 */
export const LEGACY_GATEWAY_WINDOWS_TASK_NAMES: string[] = ["OpenClaw Gateway"];

export function normalizeGatewayProfile(profile?: string): string | null {
  const trimmed = profile?.trim();
  if (!trimmed || normalizeLowercaseStringOrEmpty(trimmed) === "default") {
    return null;
  }
  return trimmed;
}

export function resolveGatewayProfileSuffix(profile?: string): string {
  const normalized = normalizeGatewayProfile(profile);
  return normalized ? `-${normalized}` : "";
}

export function resolveGatewayLaunchAgentLabel(profile?: string): string {
  const normalized = normalizeGatewayProfile(profile);
  if (!normalized) {
    return GATEWAY_LAUNCH_AGENT_LABEL;
  }
  return `ai.enclawed.${normalized}`;
}

export function resolveLegacyGatewayLaunchAgentLabels(profile?: string): string[] {
  void profile;
  return [];
}

export function resolveGatewaySystemdServiceName(profile?: string): string {
  const suffix = resolveGatewayProfileSuffix(profile);
  if (!suffix) {
    return GATEWAY_SYSTEMD_SERVICE_NAME;
  }
  return `enclawed-gateway${suffix}`;
}

export function resolveGatewayWindowsTaskName(profile?: string): string {
  const normalized = normalizeGatewayProfile(profile);
  if (!normalized) {
    return GATEWAY_WINDOWS_TASK_NAME;
  }
  return `Enclawed Gateway (${normalized})`;
}

export function formatGatewayServiceDescription(params?: {
  profile?: string;
  version?: string;
}): string {
  const profile = normalizeGatewayProfile(params?.profile);
  const version = params?.version?.trim();
  const parts: string[] = [];
  if (profile) {
    parts.push(`profile: ${profile}`);
  }
  if (version) {
    parts.push(`v${version}`);
  }
  if (parts.length === 0) {
    return "Enclawed Gateway";
  }
  return `Enclawed Gateway (${parts.join(", ")})`;
}

export function resolveGatewayServiceDescription(params: {
  env: Record<string, string | undefined>;
  environment?: Record<string, string | undefined>;
  description?: string;
}): string {
  return (
    params.description ??
    formatGatewayServiceDescription({
      profile: params.env.ENCLAWED_PROFILE,
      version: params.environment?.ENCLAWED_SERVICE_VERSION ?? params.env.ENCLAWED_SERVICE_VERSION,
    })
  );
}

export function resolveNodeLaunchAgentLabel(): string {
  return NODE_LAUNCH_AGENT_LABEL;
}

export function resolveNodeSystemdServiceName(): string {
  return NODE_SYSTEMD_SERVICE_NAME;
}

export function resolveNodeWindowsTaskName(): string {
  return NODE_WINDOWS_TASK_NAME;
}

export function formatNodeServiceDescription(params?: { version?: string }): string {
  const version = params?.version?.trim();
  if (!version) {
    return "Enclawed Node Host";
  }
  return `Enclawed Node Host (v${version})`;
}
