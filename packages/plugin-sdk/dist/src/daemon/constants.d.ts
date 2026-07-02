export declare const GATEWAY_LAUNCH_AGENT_LABEL = "ai.enclawed.gateway";
export declare const GATEWAY_SYSTEMD_SERVICE_NAME = "enclawed-gateway";
export declare const GATEWAY_WINDOWS_TASK_NAME = "Enclawed Gateway";
export declare const GATEWAY_SERVICE_MARKER = "enclawed";
export declare const GATEWAY_SERVICE_KIND = "gateway";
export declare const NODE_LAUNCH_AGENT_LABEL = "ai.enclawed.node";
export declare const NODE_SYSTEMD_SERVICE_NAME = "enclawed-node";
export declare const NODE_WINDOWS_TASK_NAME = "Enclawed Node";
export declare const NODE_SERVICE_MARKER = "enclawed";
export declare const NODE_SERVICE_KIND = "node";
export declare const NODE_WINDOWS_TASK_SCRIPT_NAME = "node.cmd";
/**
 * Legacy launch-agent labels we still detect during boot so existing
 * registrations from older installs can be discovered. Migration (stop /
 * remove / install with the new label) is NOT performed automatically yet;
 * see the rename sweep follow-up task. For now this is detection-only.
 */
export declare const LEGACY_GATEWAY_LAUNCH_AGENT_LABELS: string[];
/**
 * Legacy systemd unit names we still detect during boot. As with the
 * launch-agent labels above, this is detection-only; the operator must run
 * the migration command (TBD follow-up task) to stop the old unit, remove
 * the unit file, and install the new "enclawed-gateway" unit. The
 * pre-existing "clawdbot-gateway" entry stays in this list.
 */
export declare const LEGACY_GATEWAY_SYSTEMD_SERVICE_NAMES: string[];
/**
 * Legacy Windows task names still detected for migration discovery.
 */
export declare const LEGACY_GATEWAY_WINDOWS_TASK_NAMES: string[];
export declare function normalizeGatewayProfile(profile?: string): string | null;
export declare function resolveGatewayProfileSuffix(profile?: string): string;
export declare function resolveGatewayLaunchAgentLabel(profile?: string): string;
export declare function resolveLegacyGatewayLaunchAgentLabels(profile?: string): string[];
export declare function resolveGatewaySystemdServiceName(profile?: string): string;
export declare function resolveGatewayWindowsTaskName(profile?: string): string;
export declare function formatGatewayServiceDescription(params?: {
    profile?: string;
    version?: string;
}): string;
export declare function resolveGatewayServiceDescription(params: {
    env: Record<string, string | undefined>;
    environment?: Record<string, string | undefined>;
    description?: string;
}): string;
export declare function resolveNodeLaunchAgentLabel(): string;
export declare function resolveNodeSystemdServiceName(): string;
export declare function resolveNodeWindowsTaskName(): string;
export declare function formatNodeServiceDescription(params?: {
    version?: string;
}): string;
