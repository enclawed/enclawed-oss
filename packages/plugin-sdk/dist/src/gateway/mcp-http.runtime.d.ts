import type { EnclawedConfig } from "../config/types.enclawed.js";
import { clearActiveMcpLoopbackRuntime, createMcpLoopbackServerConfig, getActiveMcpLoopbackRuntime, setActiveMcpLoopbackRuntime } from "./mcp-http.loopback-runtime.js";
import { type McpLoopbackTool, type McpToolSchemaEntry } from "./mcp-http.schema.js";
type CachedScopedTools = {
    tools: McpLoopbackTool[];
    toolSchema: McpToolSchemaEntry[];
    configRef: EnclawedConfig;
    time: number;
};
export declare class McpLoopbackToolCache {
    #private;
    resolve(params: {
        cfg: EnclawedConfig;
        sessionKey: string;
        messageProvider: string | undefined;
        accountId: string | undefined;
        senderIsOwner: boolean | undefined;
    }): CachedScopedTools;
}
export { clearActiveMcpLoopbackRuntime, createMcpLoopbackServerConfig, getActiveMcpLoopbackRuntime, setActiveMcpLoopbackRuntime, };
