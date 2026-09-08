import type { EnclawedConfig } from "./config.js";
export declare function resolveChannelCapabilities(params: {
    cfg?: Partial<EnclawedConfig>;
    channel?: string | null;
    accountId?: string | null;
}): string[] | undefined;
