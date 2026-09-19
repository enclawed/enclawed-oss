import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { ChannelId } from "./plugins/types.public.js";
export type ReadOnlyInspectedAccount = Record<string, unknown>;
export declare function inspectReadOnlyChannelAccount(params: {
    channelId: ChannelId;
    cfg: EnclawedConfig;
    accountId?: string | null;
}): Promise<ReadOnlyInspectedAccount | null>;
