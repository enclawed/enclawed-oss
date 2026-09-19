import type { EnclawedConfig } from "../config/types.enclawed.js";
/** Resolve the config path prefix for a channel account, falling back to the root channel section. */
export declare function resolveChannelAccountConfigBasePath(params: {
    cfg: EnclawedConfig;
    channelKey: string;
    accountId: string;
}): string;
