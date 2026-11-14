import type { EnclawedConfig } from "../config/types.js";
export type GatewayConnectionDetails = {
    url: string;
    urlSource: string;
    bindDetail?: string;
    remoteFallbackNote?: string;
    message: string;
};
type GatewayConnectionDetailResolvers = {
    loadConfig?: () => EnclawedConfig;
    resolveConfigPath?: (env: NodeJS.ProcessEnv) => string;
    resolveGatewayPort?: (cfg?: EnclawedConfig, env?: NodeJS.ProcessEnv) => number;
};
export declare function buildGatewayConnectionDetailsWithResolvers(options?: {
    config?: EnclawedConfig;
    url?: string;
    configPath?: string;
    urlSource?: "cli" | "env";
}, resolvers?: GatewayConnectionDetailResolvers): GatewayConnectionDetails;
export {};
