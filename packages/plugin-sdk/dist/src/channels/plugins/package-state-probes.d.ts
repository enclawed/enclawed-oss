import type { EnclawedConfig } from "../../config/types.enclawed.js";
export type ChannelPackageStateMetadataKey = "configuredState" | "persistedAuthState";
export declare function listBundledChannelIdsForPackageState(metadataKey: ChannelPackageStateMetadataKey): string[];
export declare function hasBundledChannelPackageState(params: {
    metadataKey: ChannelPackageStateMetadataKey;
    channelId: string;
    cfg: EnclawedConfig;
    env?: NodeJS.ProcessEnv;
}): boolean;
