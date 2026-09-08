import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { AnyAgentTool } from "./pi-tools.types.js";
import type { SandboxToolPolicy } from "./sandbox.js";
export declare function resolveSubagentToolPolicy(cfg?: EnclawedConfig, depth?: number): SandboxToolPolicy;
export declare function resolveSubagentToolPolicyForSession(cfg: EnclawedConfig | undefined, sessionKey: string): SandboxToolPolicy;
export declare function filterToolsByPolicy(tools: AnyAgentTool[], policy?: SandboxToolPolicy): AnyAgentTool[];
export declare function resolveGroupContextFromSessionKey(sessionKey?: string | null): {
    channel?: string;
    groupIds?: string[];
};
export declare function resolveEffectiveToolPolicy(params: {
    config?: EnclawedConfig;
    sessionKey?: string;
    agentId?: string;
    modelProvider?: string;
    modelId?: string;
}): {
    agentId: string | undefined;
    globalPolicy: SandboxToolPolicy | undefined;
    globalProviderPolicy: SandboxToolPolicy | undefined;
    agentPolicy: SandboxToolPolicy | undefined;
    agentProviderPolicy: SandboxToolPolicy | undefined;
    profile: import("../config/types.tools.js").ToolProfileId | undefined;
    providerProfile: string | undefined;
    profileAlsoAllow: string[] | undefined;
    providerProfileAlsoAllow: string[] | undefined;
};
export declare function resolveGroupToolPolicy(params: {
    config?: EnclawedConfig;
    sessionKey?: string;
    spawnedBy?: string | null;
    messageProvider?: string;
    groupId?: string | null;
    groupChannel?: string | null;
    groupSpace?: string | null;
    accountId?: string | null;
    senderId?: string | null;
    senderName?: string | null;
    senderUsername?: string | null;
    senderE164?: string | null;
}): SandboxToolPolicy | undefined;
export { isToolAllowedByPolicies, isToolAllowedByPolicyName } from "./tool-policy-match.js";
