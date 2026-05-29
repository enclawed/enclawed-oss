import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { PluginWebSearchProviderEntry, WebSearchProviderToolDefinition } from "../plugins/web-provider-types.js";
import type { RuntimeWebSearchMetadata } from "../secrets/runtime-web-tools.types.js";
type WebSearchConfig = NonNullable<EnclawedConfig["tools"]>["web"] extends infer Web ? Web extends {
    search?: infer Search;
} ? Search : undefined : undefined;
export type ResolveWebSearchDefinitionParams = {
    config?: EnclawedConfig;
    sandboxed?: boolean;
    runtimeWebSearch?: RuntimeWebSearchMetadata;
    providerId?: string;
    preferRuntimeProviders?: boolean;
};
export type RunWebSearchParams = ResolveWebSearchDefinitionParams & {
    args: Record<string, unknown>;
};
export type RunWebSearchResult = {
    provider: string;
    result: Record<string, unknown>;
};
export type ListWebSearchProvidersParams = {
    config?: EnclawedConfig;
};
export type RuntimeWebSearchProviderEntry = PluginWebSearchProviderEntry;
export type RuntimeWebSearchToolDefinition = WebSearchProviderToolDefinition;
export type RuntimeWebSearchConfig = WebSearchConfig;
export {};
