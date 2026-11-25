import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { GatewayMessageChannel } from "../../utils/message-channel.js";
import { type AnyAgentTool } from "./common.js";
export declare function createNodesTool(options?: {
    agentSessionKey?: string;
    agentChannel?: GatewayMessageChannel;
    agentAccountId?: string;
    currentChannelId?: string;
    currentThreadTs?: string | number;
    config?: EnclawedConfig;
    modelHasVision?: boolean;
    allowMediaInvokeCommands?: boolean;
}): AnyAgentTool;
