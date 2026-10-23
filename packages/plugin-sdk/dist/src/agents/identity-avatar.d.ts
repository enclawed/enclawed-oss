import type { EnclawedConfig } from "../config/types.enclawed.js";
export type AgentAvatarResolution = {
    kind: "none";
    reason: string;
} | {
    kind: "local";
    filePath: string;
} | {
    kind: "remote";
    url: string;
} | {
    kind: "data";
    url: string;
};
export declare function resolveAgentAvatar(cfg: EnclawedConfig, agentId: string, opts?: {
    includeUiOverride?: boolean;
}): AgentAvatarResolution;
