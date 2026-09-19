import type { EnclawedConfig } from "../../config/types.enclawed.js";
import { callGateway } from "../../gateway/call.js";
import type { AnyAgentTool } from "./common.js";
type GatewayCaller = typeof callGateway;
export declare function createSessionsHistoryTool(opts?: {
    agentSessionKey?: string;
    sandboxed?: boolean;
    config?: EnclawedConfig;
    callGateway?: GatewayCaller;
}): AnyAgentTool;
export {};
