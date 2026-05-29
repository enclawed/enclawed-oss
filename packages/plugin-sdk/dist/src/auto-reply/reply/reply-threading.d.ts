import type { ChannelThreadingAdapter } from "../../channels/plugins/types.core.js";
import type { ReplyToMode } from "../../config/types.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { OriginatingChannelType } from "../templating.js";
import type { ReplyPayload, ReplyThreadingPolicy } from "../types.js";
export declare function resolveConfiguredReplyToMode(cfg: EnclawedConfig, channel?: OriginatingChannelType, chatType?: string | null): ReplyToMode;
export declare function resolveReplyToModeWithThreading(cfg: EnclawedConfig, threading: ChannelThreadingAdapter | undefined, params?: {
    channel?: OriginatingChannelType;
    accountId?: string | null;
    chatType?: string | null;
}): ReplyToMode;
export declare function resolveReplyToMode(cfg: EnclawedConfig, channel?: OriginatingChannelType, accountId?: string | null, chatType?: string | null): ReplyToMode;
export declare function createReplyToModeFilter(mode: ReplyToMode, opts?: {
    allowExplicitReplyTagsWhenOff?: boolean;
}): (payload: ReplyPayload) => ReplyPayload;
export declare function resolveImplicitCurrentMessageReplyAllowance(mode: ReplyToMode | undefined, policy?: ReplyThreadingPolicy): boolean;
export declare function resolveBatchedReplyThreadingPolicy(mode: ReplyToMode, isBatched: boolean): ReplyThreadingPolicy | undefined;
export declare function createReplyToModeFilterForChannel(mode: ReplyToMode, channel?: OriginatingChannelType): (payload: ReplyPayload) => ReplyPayload;
