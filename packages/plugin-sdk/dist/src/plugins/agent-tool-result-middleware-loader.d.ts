import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { AgentToolResultMiddleware, AgentToolResultMiddlewareRuntime } from "./agent-tool-result-middleware-types.js";
import { type PluginManifestRegistry } from "./manifest-registry.js";
declare function listMiddlewareOwnerPluginIds(params: {
    manifestRegistry: PluginManifestRegistry;
    runtime: AgentToolResultMiddlewareRuntime;
}): string[];
export declare function loadAgentToolResultMiddlewaresForRuntime(params: {
    runtime: AgentToolResultMiddlewareRuntime;
    config?: EnclawedConfig;
    workspaceDir?: string;
    env?: NodeJS.ProcessEnv;
    manifestRegistry?: PluginManifestRegistry;
}): Promise<AgentToolResultMiddleware[]>;
export declare const __testing: {
    listMiddlewareOwnerPluginIds: typeof listMiddlewareOwnerPluginIds;
};
export {};
