import type { EnclawedConfig } from "../config/types.enclawed.js";
export { describeCodexNativeWebSearch, resolveCodexNativeWebSearchConfig, } from "./codex-native-web-search.shared.js";
export type CodexNativeSearchMode = "cached" | "live";
export type CodexNativeSearchContextSize = "low" | "medium" | "high";
export type CodexNativeSearchUserLocation = {
    country?: string;
    region?: string;
    city?: string;
    timezone?: string;
};
export type ResolvedCodexNativeWebSearchConfig = {
    enabled: boolean;
    mode: CodexNativeSearchMode;
    allowedDomains?: string[];
    contextSize?: CodexNativeSearchContextSize;
    userLocation?: CodexNativeSearchUserLocation;
};
export type CodexNativeSearchActivation = {
    globalWebSearchEnabled: boolean;
    codexNativeEnabled: boolean;
    codexMode: CodexNativeSearchMode;
    nativeEligible: boolean;
    hasRequiredAuth: boolean;
    state: "managed_only" | "native_active";
    inactiveReason?: "globally_disabled" | "codex_not_enabled" | "model_not_eligible" | "codex_auth_missing";
};
export type CodexNativeSearchPayloadPatchResult = {
    status: "payload_not_object" | "native_tool_already_present" | "injected";
};
export declare function isCodexNativeSearchEligibleModel(params: {
    modelProvider?: string;
    modelApi?: string;
}): boolean;
export declare function hasCodexNativeWebSearchTool(tools: unknown): boolean;
export declare function hasAvailableCodexAuth(params: {
    config?: EnclawedConfig;
    agentDir?: string;
}): boolean;
export declare function resolveCodexNativeSearchActivation(params: {
    config?: EnclawedConfig;
    modelProvider?: string;
    modelApi?: string;
    agentDir?: string;
}): CodexNativeSearchActivation;
export declare function buildCodexNativeWebSearchTool(config: EnclawedConfig | undefined): Record<string, unknown>;
export declare function patchCodexNativeWebSearchPayload(params: {
    payload: unknown;
    config?: EnclawedConfig;
}): CodexNativeSearchPayloadPatchResult;
export declare function shouldSuppressManagedWebSearchTool(params: {
    config?: EnclawedConfig;
    modelProvider?: string;
    modelApi?: string;
    agentDir?: string;
}): boolean;
export declare function isCodexNativeWebSearchRelevant(params: {
    config: EnclawedConfig;
    agentId?: string;
    agentDir?: string;
}): boolean;
