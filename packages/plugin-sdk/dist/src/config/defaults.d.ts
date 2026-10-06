import type { EnclawedConfig } from "./types.enclawed.js";
type WarnState = {
    warned: boolean;
};
export declare function resolveNormalizedProviderModelMaxTokens(params: {
    providerId: string;
    modelId: string;
    contextWindow: number;
    rawMaxTokens: number;
}): number;
export type SessionDefaultsOptions = {
    warn?: (message: string) => void;
    warnState?: WarnState;
};
export declare function applyMessageDefaults(cfg: EnclawedConfig): EnclawedConfig;
export declare function applySessionDefaults(cfg: EnclawedConfig, options?: SessionDefaultsOptions): EnclawedConfig;
export declare function applyTalkConfigNormalization(config: EnclawedConfig): EnclawedConfig;
export declare function applyModelDefaults(cfg: EnclawedConfig): EnclawedConfig;
export declare function applyAgentDefaults(cfg: EnclawedConfig): EnclawedConfig;
export declare function applyLoggingDefaults(cfg: EnclawedConfig): EnclawedConfig;
export declare function applyContextPruningDefaults(cfg: EnclawedConfig): EnclawedConfig;
export declare function applyCompactionDefaults(cfg: EnclawedConfig): EnclawedConfig;
export declare function resetSessionDefaultsWarningForTests(): void;
export {};
