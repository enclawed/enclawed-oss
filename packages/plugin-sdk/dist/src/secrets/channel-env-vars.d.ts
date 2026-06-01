import type { EnclawedConfig } from "../config/types.enclawed.js";
type ChannelEnvVarLookupParams = {
    config?: EnclawedConfig;
    workspaceDir?: string;
    env?: NodeJS.ProcessEnv;
};
export declare function resolveChannelEnvVars(params?: ChannelEnvVarLookupParams): Record<string, readonly string[]>;
export declare function getChannelEnvVars(channelId: string, params?: ChannelEnvVarLookupParams): string[];
export declare function listKnownChannelEnvVarNames(params?: ChannelEnvVarLookupParams): string[];
export {};
