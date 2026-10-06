import type { EnclawedConfig } from "../config/types.js";
export type ProviderModelRef = {
    provider: string;
    model: string;
};
export declare function resolveConfiguredProviderFallback(params: {
    cfg: Pick<EnclawedConfig, "models">;
    defaultProvider: string;
    defaultModel?: string;
}): ProviderModelRef | null;
