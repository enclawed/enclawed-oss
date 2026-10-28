import type { EnclawedConfig } from "../config/types.enclawed.js";
type ChannelPresenceOptions = {
    includePersistedAuthState?: boolean;
    persistedAuthStateProbe?: {
        listChannelIds: () => readonly string[];
        hasState: (params: {
            channelId: string;
            cfg: EnclawedConfig;
            env: NodeJS.ProcessEnv;
        }) => boolean;
    };
};
export declare function hasMeaningfulChannelConfig(value: unknown): boolean;
export declare function listPotentialConfiguredChannelIds(cfg: EnclawedConfig, env?: NodeJS.ProcessEnv, options?: ChannelPresenceOptions): string[];
export declare function hasPotentialConfiguredChannels(cfg: EnclawedConfig | null | undefined, env?: NodeJS.ProcessEnv, options?: ChannelPresenceOptions): boolean;
export {};
