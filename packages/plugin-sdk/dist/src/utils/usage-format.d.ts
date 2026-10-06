import type { NormalizedUsage } from "../agents/usage.js";
import type { EnclawedConfig } from "../config/types.enclawed.js";
export type ModelCostConfig = {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
};
export type UsageTotals = {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
};
export declare function formatTokenCount(value?: number): string;
export declare function formatUsd(value?: number): string | undefined;
export declare function resolveModelCostConfig(params: {
    provider?: string;
    model?: string;
    config?: EnclawedConfig;
    allowPluginNormalization?: boolean;
}): ModelCostConfig | undefined;
export declare function estimateUsageCost(params: {
    usage?: NormalizedUsage | UsageTotals | null;
    cost?: ModelCostConfig;
}): number | undefined;
export declare function __resetUsageFormatCachesForTest(): void;
