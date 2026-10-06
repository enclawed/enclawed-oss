import { type ModelRef } from "../agents/model-selection.js";
import type { EnclawedConfig } from "../config/types.enclawed.js";
import { getCachedGatewayModelPricing } from "./model-pricing-cache-state.js";
export { getCachedGatewayModelPricing };
export declare function collectConfiguredModelPricingRefs(config: EnclawedConfig): ModelRef[];
export declare function refreshGatewayModelPricingCache(params: {
    config: EnclawedConfig;
    fetchImpl?: typeof fetch;
}): Promise<void>;
export declare function startGatewayModelPricingRefresh(params: {
    config: EnclawedConfig;
    fetchImpl?: typeof fetch;
}): () => void;
export declare function getGatewayModelPricingCacheMeta(): {
    cachedAt: number;
    ttlMs: number;
    size: number;
};
export declare function __resetGatewayModelPricingCacheForTest(): void;
