import type { EnclawedConfig } from "./config.js";
export declare function resolveChannelConfigRecord(cfg: EnclawedConfig, channelId: string): Record<string, unknown> | null;
export declare function hasMeaningfulChannelConfigShallow(value: unknown): boolean;
export declare function isStaticallyChannelConfigured(cfg: EnclawedConfig, channelId: string, env?: NodeJS.ProcessEnv): boolean;
