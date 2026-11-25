import type { EnclawedConfig } from "../../config/types.enclawed.js";
export declare function listBundledChannelIdsWithPersistedAuthState(): string[];
export declare function hasBundledChannelPersistedAuthState(params: {
    channelId: string;
    cfg: EnclawedConfig;
    env?: NodeJS.ProcessEnv;
}): boolean;
