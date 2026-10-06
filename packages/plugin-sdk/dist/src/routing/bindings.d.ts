import type { AgentRouteBinding } from "../config/types.agents.js";
import type { EnclawedConfig } from "../config/types.enclawed.js";
export declare function listBindings(cfg: EnclawedConfig): AgentRouteBinding[];
export declare function listBoundAccountIds(cfg: EnclawedConfig, channelId: string): string[];
export declare function resolveDefaultAgentBoundAccountId(cfg: EnclawedConfig, channelId: string): string | null;
export declare function buildChannelAccountBindings(cfg: EnclawedConfig): Map<string, Map<string, string[]>>;
export declare function resolvePreferredAccountId(params: {
    accountIds: string[];
    defaultAccountId: string;
    boundAccounts: string[];
}): string;
