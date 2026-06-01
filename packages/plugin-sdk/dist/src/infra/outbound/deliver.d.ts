import type { ReplyPayload } from "../../auto-reply/types.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { OutboundMediaAccess } from "../../media/load-options.js";
import type { OutboundDeliveryResult } from "./deliver-types.js";
import type { OutboundIdentity } from "./identity.js";
import type { DeliveryMirror } from "./mirror.js";
import { type NormalizedOutboundPayload } from "./payloads.js";
import { type OutboundSendDeps } from "./send-deps.js";
import type { OutboundSessionContext } from "./session-context.js";
import type { OutboundChannel } from "./targets.js";
export type { OutboundDeliveryResult } from "./deliver-types.js";
export type { NormalizedOutboundPayload } from "./payloads.js";
export { normalizeOutboundPayloads } from "./payloads.js";
export { resolveOutboundSendDep, type OutboundSendDeps } from "./send-deps.js";
type DeliverOutboundPayloadsCoreParams = {
    cfg: EnclawedConfig;
    channel: Exclude<OutboundChannel, "none">;
    to: string;
    accountId?: string;
    payloads: ReplyPayload[];
    replyToId?: string | null;
    /** Optional reply-to policy override forwarded to channel outbound adapters. */
    replyToMode?: import("../../config/types.base.js").ReplyToMode;
    /** Optional per-delivery formatting knobs forwarded to channel outbound adapters. */
    formatting?: import("../../channels/plugins/outbound.types.js").ChannelOutboundFormattingOptions;
    /** Optional media access scope (local roots / read fn) forwarded to delivery. */
    mediaAccess?: OutboundMediaAccess;
    threadId?: string | number | null;
    identity?: OutboundIdentity;
    deps?: OutboundSendDeps;
    gifPlayback?: boolean;
    forceDocument?: boolean;
    abortSignal?: AbortSignal;
    bestEffort?: boolean;
    onError?: (err: unknown, payload: NormalizedOutboundPayload) => void;
    onPayload?: (payload: NormalizedOutboundPayload) => void;
    /** Session/agent context used for hooks and media local-root scoping. */
    session?: OutboundSessionContext;
    mirror?: DeliveryMirror;
    silent?: boolean;
    gatewayClientScopes?: readonly string[];
};
export type DeliverOutboundPayloadsParams = DeliverOutboundPayloadsCoreParams & {
    /** @internal Skip write-ahead queue (used by crash-recovery to avoid re-enqueueing). */
    skipQueue?: boolean;
};
export declare function deliverOutboundPayloads(params: DeliverOutboundPayloadsParams): Promise<OutboundDeliveryResult[]>;
