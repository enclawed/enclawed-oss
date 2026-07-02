import type { EnclawedConfig } from "../../config/types.enclawed.js";
export declare function listBundledChannelIdsWithConfiguredState(): string[];
export declare function hasBundledChannelConfiguredState(params: {
    channelId: string;
    cfg: EnclawedConfig;
    env?: NodeJS.ProcessEnv;
}): boolean;
