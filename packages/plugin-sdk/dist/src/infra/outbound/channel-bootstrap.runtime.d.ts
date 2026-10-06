import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { DeliverableMessageChannel } from "../../utils/message-channel.js";
export declare function resetOutboundChannelBootstrapStateForTests(): void;
export declare function bootstrapOutboundChannelPlugin(params: {
    channel: DeliverableMessageChannel;
    cfg?: EnclawedConfig;
}): void;
