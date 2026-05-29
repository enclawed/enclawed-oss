import type { AnyAgentTool } from "../agents/tools/common.js";
import type { EnclawedConfig } from "../config/types.enclawed.js";
export type GatewayScopedToolSurface = "http" | "loopback";
export declare function resolveGatewayScopedTools(params: {
    cfg: EnclawedConfig;
    sessionKey: string;
    messageProvider?: string;
    accountId?: string;
    agentTo?: string;
    agentThreadId?: string;
    allowGatewaySubagentBinding?: boolean;
    allowMediaInvokeCommands?: boolean;
    surface?: GatewayScopedToolSurface;
    excludeToolNames?: Iterable<string>;
    disablePluginTools?: boolean;
    senderIsOwner?: boolean;
}): {
    agentId: string | undefined;
    tools: AnyAgentTool[];
};
