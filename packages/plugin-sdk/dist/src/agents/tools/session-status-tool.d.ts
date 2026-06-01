import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { AnyAgentTool } from "./common.js";
export declare function createSessionStatusTool(opts?: {
    agentSessionKey?: string;
    config?: EnclawedConfig;
    sandboxed?: boolean;
}): AnyAgentTool;
