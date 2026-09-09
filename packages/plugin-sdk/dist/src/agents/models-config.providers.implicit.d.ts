import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { ProviderConfig } from "./models-config.providers.secrets.js";
type ImplicitProviderParams = {
    agentDir: string;
    config?: EnclawedConfig;
    env?: NodeJS.ProcessEnv;
    workspaceDir?: string;
    explicitProviders?: Record<string, ProviderConfig> | null;
};
export declare function resolveProviderDiscoveryFilterForTest(params: {
    config?: EnclawedConfig;
    workspaceDir?: string;
    env: NodeJS.ProcessEnv;
}): string[] | undefined;
export declare function resolveImplicitProviders(params: ImplicitProviderParams): Promise<NonNullable<EnclawedConfig["models"]>["providers"]>;
export {};
