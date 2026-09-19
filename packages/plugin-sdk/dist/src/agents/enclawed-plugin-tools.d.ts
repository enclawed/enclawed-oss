import type { EnclawedConfig } from "../config/types.enclawed.js";
import { type EnclawedPluginToolOptions } from "./enclawed-tools.plugin-context.js";
import type { AnyAgentTool } from "./tools/common.js";
type ResolveEnclawedPluginToolsOptions = EnclawedPluginToolOptions & {
    pluginToolAllowlist?: string[];
    currentChannelId?: string;
    currentThreadTs?: string;
    currentMessageId?: string | number;
    sandboxRoot?: string;
    modelHasVision?: boolean;
    modelProvider?: string;
    allowMediaInvokeCommands?: boolean;
    requesterAgentIdOverride?: string;
    requireExplicitMessageTarget?: boolean;
    disableMessageTool?: boolean;
    disablePluginTools?: boolean;
};
export declare function resolveEnclawedPluginToolsForOptions(params: {
    options?: ResolveEnclawedPluginToolsOptions;
    resolvedConfig?: EnclawedConfig;
    existingToolNames?: Set<string>;
}): AnyAgentTool[];
export {};
