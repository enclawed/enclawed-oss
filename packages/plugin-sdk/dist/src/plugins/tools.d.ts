import type { AnyAgentTool } from "../agents/tools/common.js";
import type { EnclawedPluginToolContext } from "./types.js";
type PluginToolMeta = {
    pluginId: string;
    optional: boolean;
};
export declare function getPluginToolMeta(tool: AnyAgentTool): PluginToolMeta | undefined;
export declare function copyPluginToolMeta(source: AnyAgentTool, target: AnyAgentTool): void;
export declare function resolvePluginTools(params: {
    context: EnclawedPluginToolContext;
    existingToolNames?: Set<string>;
    toolAllowlist?: string[];
    suppressNameConflicts?: boolean;
    allowGatewaySubagentBinding?: boolean;
    env?: NodeJS.ProcessEnv;
}): AnyAgentTool[];
export {};
