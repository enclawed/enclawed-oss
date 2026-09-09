import type { EnclawedConfig } from "../../config/types.enclawed.js";
import { type DeliverableMessageChannel } from "../../utils/message-channel.js";
export type MessageChannelId = DeliverableMessageChannel;
export type MessageChannelSelectionSource = "explicit" | "tool-context-fallback" | "single-configured";
export declare function listConfiguredMessageChannels(cfg: EnclawedConfig): Promise<MessageChannelId[]>;
export declare function resolveMessageChannelSelection(params: {
    cfg: EnclawedConfig;
    channel?: string | null;
    fallbackChannel?: string | null;
}): Promise<{
    channel: MessageChannelId;
    configured: MessageChannelId[];
    source: MessageChannelSelectionSource;
}>;
export declare const __testing: {
    resetLoggedChannelSelectionErrors(): void;
};
