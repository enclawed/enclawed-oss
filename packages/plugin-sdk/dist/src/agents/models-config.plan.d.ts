import type { EnclawedConfig } from "../config/types.enclawed.js";
import { type ProviderConfig } from "./models-config.providers.js";
export type ResolveImplicitProvidersForModelsJson = (params: {
    agentDir: string;
    config: EnclawedConfig;
    env: NodeJS.ProcessEnv;
    explicitProviders: Record<string, ProviderConfig>;
}) => Promise<Record<string, ProviderConfig>>;
export type ModelsJsonPlan = {
    action: "skip";
} | {
    action: "noop";
} | {
    action: "write";
    contents: string;
};
export declare function resolveProvidersForModelsJsonWithDeps(params: {
    cfg: EnclawedConfig;
    agentDir: string;
    env: NodeJS.ProcessEnv;
}, deps?: {
    resolveImplicitProviders?: ResolveImplicitProvidersForModelsJson;
}): Promise<Record<string, ProviderConfig>>;
export declare function planEnclawedModelsJsonWithDeps(params: {
    cfg: EnclawedConfig;
    sourceConfigForSecrets?: EnclawedConfig;
    agentDir: string;
    env: NodeJS.ProcessEnv;
    existingRaw: string;
    existingParsed: unknown;
}, deps?: {
    resolveImplicitProviders?: ResolveImplicitProvidersForModelsJson;
}): Promise<ModelsJsonPlan>;
export declare function planEnclawedModelsJson(params: Parameters<typeof planEnclawedModelsJsonWithDeps>[0]): Promise<ModelsJsonPlan>;
