import type { EnclawedConfig } from "../config/types.enclawed.js";
export type ProviderAuthAliasLookupParams = {
    config?: EnclawedConfig;
    workspaceDir?: string;
    env?: NodeJS.ProcessEnv;
    includeUntrustedWorkspacePlugins?: boolean;
};
export declare function resolveProviderAuthAliasMap(params?: ProviderAuthAliasLookupParams): Record<string, string>;
export declare function resolveProviderIdForAuth(provider: string, params?: ProviderAuthAliasLookupParams): string;
