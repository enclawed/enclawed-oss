import type { HumanDelayConfig, IdentityConfig } from "../config/types.base.js";
import type { EnclawedConfig } from "../config/types.enclawed.js";
export declare function resolveAgentIdentity(cfg: EnclawedConfig, agentId: string): IdentityConfig | undefined;
export declare function resolveAckReaction(cfg: EnclawedConfig, agentId: string, opts?: {
    channel?: string;
    accountId?: string;
}): string;
export declare function resolveIdentityNamePrefix(cfg: EnclawedConfig, agentId: string): string | undefined;
export declare function resolveMessagePrefix(cfg: EnclawedConfig, agentId: string, opts?: {
    configured?: string;
    hasAllowFrom?: boolean;
    fallback?: string;
}): string;
export declare function resolveResponsePrefix(cfg: EnclawedConfig, agentId: string, opts?: {
    channel?: string;
    accountId?: string;
}): string | undefined;
export declare function resolveEffectiveMessagesConfig(cfg: EnclawedConfig, agentId: string, opts?: {
    hasAllowFrom?: boolean;
    fallbackMessagePrefix?: string;
    channel?: string;
    accountId?: string;
}): {
    messagePrefix: string;
    responsePrefix?: string;
};
export declare function resolveHumanDelayConfig(cfg: EnclawedConfig, agentId: string): HumanDelayConfig | undefined;
