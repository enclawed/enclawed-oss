import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { GatewayMessageChannel } from "../../utils/message-channel.js";
import type { AnyAgentTool } from "./common.js";
export declare function createTtsTool(opts?: {
    config?: EnclawedConfig;
    agentChannel?: GatewayMessageChannel;
}): AnyAgentTool;
