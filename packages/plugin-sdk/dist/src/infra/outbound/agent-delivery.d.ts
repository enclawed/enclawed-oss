import type { ChannelOutboundTargetMode } from "../../channels/plugins/types.public.js";
import type { SessionEntry } from "../../config/sessions.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
import { type GatewayMessageChannel } from "../../utils/message-channel.js";
import type { OutboundTargetResolution } from "./targets.js";
import { type SessionDeliveryTarget } from "./targets.js";
export type AgentDeliveryPlan = {
    baseDelivery: SessionDeliveryTarget;
    resolvedChannel: GatewayMessageChannel;
    resolvedTo?: string;
    resolvedAccountId?: string;
    resolvedThreadId?: string | number;
    deliveryTargetMode?: ChannelOutboundTargetMode;
};
export declare function resolveAgentDeliveryPlan(params: {
    sessionEntry?: SessionEntry;
    requestedChannel?: string;
    explicitTo?: string;
    explicitThreadId?: string | number;
    accountId?: string;
    wantsDelivery: boolean;
    /**
     * The channel that originated the current agent turn.  When provided,
     * overrides session-level `lastChannel` to prevent cross-channel reply
     * routing in shared sessions (dmScope="main").
     *
     * @see https://github.com/enclawed/enclawed/issues/24152
     */
    turnSourceChannel?: string;
    /** Turn-source `to` — paired with `turnSourceChannel`. */
    turnSourceTo?: string;
    /** Turn-source `accountId` — paired with `turnSourceChannel`. */
    turnSourceAccountId?: string;
    /** Turn-source `threadId` — paired with `turnSourceChannel`. */
    turnSourceThreadId?: string | number;
}): AgentDeliveryPlan;
export declare function resolveAgentOutboundTarget(params: {
    cfg: EnclawedConfig;
    plan: AgentDeliveryPlan;
    targetMode?: ChannelOutboundTargetMode;
    validateExplicitTarget?: boolean;
}): {
    resolvedTarget: OutboundTargetResolution | null;
    resolvedTo?: string;
    targetMode: ChannelOutboundTargetMode;
};
