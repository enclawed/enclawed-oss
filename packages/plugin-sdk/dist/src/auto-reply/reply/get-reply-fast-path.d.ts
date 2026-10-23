import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { MsgContext } from "../templating.js";
import type { CommandContext } from "./commands-types.js";
import type { SessionInitResult } from "./session.js";
export declare function markCompleteReplyConfig<T extends EnclawedConfig>(config: T, options?: {
    runtimeMode?: "fast" | "full";
}): T;
export declare function withFastReplyConfig<T extends EnclawedConfig>(config: T): T;
export declare function withFullRuntimeReplyConfig<T extends EnclawedConfig>(config: T): T;
export declare function isCompleteReplyConfig(config: unknown): config is EnclawedConfig;
export declare function usesFullReplyRuntime(config: unknown): boolean;
export declare function resolveGetReplyConfig(params: {
    loadConfig: () => EnclawedConfig;
    isFastTestEnv: boolean;
    configOverride?: EnclawedConfig;
}): EnclawedConfig;
export declare function shouldUseReplyFastTestBootstrap(params: {
    isFastTestEnv: boolean;
    configOverride?: EnclawedConfig;
}): boolean;
export declare function shouldUseReplyFastTestRuntime(params: {
    cfg: EnclawedConfig;
    isFastTestEnv: boolean;
}): boolean;
export declare function shouldUseReplyFastDirectiveExecution(params: {
    isFastTestBootstrap: boolean;
    isGroup: boolean;
    isHeartbeat: boolean;
    resetTriggered: boolean;
    triggerBodyNormalized: string;
}): boolean;
export declare function buildFastReplyCommandContext(params: {
    ctx: MsgContext;
    cfg: EnclawedConfig;
    agentId?: string;
    sessionKey?: string;
    isGroup: boolean;
    triggerBodyNormalized: string;
    commandAuthorized: boolean;
}): CommandContext;
export declare function shouldHandleFastReplyTextCommands(params: {
    cfg: EnclawedConfig;
    commandSource?: string;
}): boolean;
export declare function initFastReplySessionState(params: {
    ctx: MsgContext;
    cfg: EnclawedConfig;
    agentId: string;
    commandAuthorized: boolean;
    workspaceDir: string;
}): SessionInitResult;
