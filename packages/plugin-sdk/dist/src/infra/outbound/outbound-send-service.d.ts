import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { ChannelId, ChannelThreadingToolContext } from "../../channels/plugins/types.public.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { OutboundMediaAccess, OutboundMediaReadFile } from "../../media/load-options.js";
import type { GatewayClientMode, GatewayClientName } from "../../utils/message-channel.js";
import type { OutboundSendDeps } from "./deliver.js";
import type { MessagePollResult, MessageSendResult } from "./message.js";
import type { OutboundMirror } from "./mirror.js";
export type OutboundGatewayContext = {
    url?: string;
    token?: string;
    timeoutMs?: number;
    clientName: GatewayClientName;
    clientDisplayName?: string;
    mode: GatewayClientMode;
};
export type OutboundSendContext = {
    cfg: EnclawedConfig;
    channel: ChannelId;
    params: Record<string, unknown>;
    /** Active agent id for per-agent outbound media root scoping. */
    agentId?: string;
    sessionKey?: string;
    requesterAccountId?: string;
    requesterSenderId?: string;
    requesterSenderName?: string;
    requesterSenderUsername?: string;
    requesterSenderE164?: string;
    mediaAccess?: OutboundMediaAccess;
    mediaReadFile?: OutboundMediaReadFile;
    accountId?: string | null;
    senderIsOwner?: boolean;
    sessionId?: string;
    gateway?: OutboundGatewayContext;
    toolContext?: ChannelThreadingToolContext;
    deps?: OutboundSendDeps;
    dryRun: boolean;
    mirror?: OutboundMirror;
    abortSignal?: AbortSignal;
    silent?: boolean;
};
export declare function executeSendAction(params: {
    ctx: OutboundSendContext;
    to: string;
    message: string;
    mediaUrl?: string;
    mediaUrls?: string[];
    gifPlayback?: boolean;
    forceDocument?: boolean;
    bestEffort?: boolean;
    replyToId?: string;
    threadId?: string | number;
}): Promise<{
    handledBy: "plugin" | "core";
    payload: unknown;
    toolResult?: AgentToolResult<unknown>;
    sendResult?: MessageSendResult;
}>;
export declare function executePollAction(params: {
    ctx: OutboundSendContext;
    resolveCorePoll: () => {
        to: string;
        question: string;
        options: string[];
        maxSelections: number;
        durationSeconds?: number;
        durationHours?: number;
        threadId?: string;
        isAnonymous?: boolean;
    };
}): Promise<{
    handledBy: "plugin" | "core";
    payload: unknown;
    toolResult?: AgentToolResult<unknown>;
    pollResult?: MessagePollResult;
}>;
