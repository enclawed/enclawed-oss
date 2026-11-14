import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { ChannelAccountSnapshot } from "./plugins/types.core.js";
import type { ChannelPlugin } from "./plugins/types.plugin.js";
export declare function buildChannelAccountSnapshot(params: {
    plugin: ChannelPlugin;
    account: unknown;
    cfg: EnclawedConfig;
    accountId: string;
    enabled: boolean;
    configured: boolean;
}): ChannelAccountSnapshot;
export declare function formatChannelAllowFrom(params: {
    plugin: ChannelPlugin;
    cfg: EnclawedConfig;
    accountId?: string | null;
    allowFrom: Array<string | number>;
}): string[];
export declare function resolveChannelAccountEnabled(params: {
    plugin: ChannelPlugin;
    account: unknown;
    cfg: EnclawedConfig;
}): boolean;
export declare function resolveChannelAccountConfigured(params: {
    plugin: ChannelPlugin;
    account: unknown;
    cfg: EnclawedConfig;
    readAccountConfiguredField?: boolean;
}): Promise<boolean>;
