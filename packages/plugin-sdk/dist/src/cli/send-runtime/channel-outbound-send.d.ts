import type { ChannelId } from "../../channels/plugins/types.public.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { OutboundMediaAccess } from "../../media/load-options.js";
type RuntimeSendOpts = {
    cfg?: EnclawedConfig;
    mediaUrl?: string;
    mediaAccess?: OutboundMediaAccess;
    mediaLocalRoots?: readonly string[];
    mediaReadFile?: (filePath: string) => Promise<Buffer>;
    accountId?: string;
    threadId?: string | number | null;
    messageThreadId?: string | number;
    replyToId?: string | number | null;
    replyToMessageId?: string | number;
    silent?: boolean;
    forceDocument?: boolean;
    gifPlayback?: boolean;
    gatewayClientScopes?: readonly string[];
};
export declare function createChannelOutboundRuntimeSend(params: {
    channelId: ChannelId;
    unavailableMessage: string;
}): {
    sendMessage: (to: string, text: string, opts?: RuntimeSendOpts) => Promise<import("../../plugin-sdk/channel-send-result.ts").OutboundDeliveryResult>;
};
export {};
