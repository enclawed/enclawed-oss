import type { ReplyToMode } from "../../config/types.base.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { ChannelThreadingAdapter } from "./types.core.js";
type ReplyToModeResolver = NonNullable<ChannelThreadingAdapter["resolveReplyToMode"]>;
export declare function createStaticReplyToModeResolver(mode: ReplyToMode): ReplyToModeResolver;
export declare function createTopLevelChannelReplyToModeResolver(channelId: string): ReplyToModeResolver;
export declare function createScopedAccountReplyToModeResolver<TAccount>(params: {
    resolveAccount: (cfg: EnclawedConfig, accountId?: string | null) => TAccount;
    resolveReplyToMode: (account: TAccount, chatType?: string | null) => ReplyToMode | null | undefined;
    fallback?: ReplyToMode;
}): ReplyToModeResolver;
export {};
