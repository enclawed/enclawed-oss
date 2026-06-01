import type { EnclawedConfig } from "../../config/types.enclawed.js";
import { type AnyAgentTool } from "./common.js";
export declare function createGatewayTool(opts?: {
    agentSessionKey?: string;
    config?: EnclawedConfig;
}): AnyAgentTool;
