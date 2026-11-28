import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { ClientToolDefinition } from "./pi-embedded-runner/run/params.js";
import type { HookContext } from "./pi-tools.before-tool-call.js";
type AnyAgentTool = AgentTool;
export declare const CLIENT_TOOL_NAME_CONFLICT_PREFIX = "client tool name conflict:";
export declare function findClientToolNameConflicts(params: {
    tools: ClientToolDefinition[];
    existingToolNames?: Iterable<string>;
}): string[];
export declare function createClientToolNameConflictError(conflicts: string[]): Error;
export declare function isClientToolNameConflictError(err: unknown): err is Error;
/**
 * What the pi runtime runs on every tool result before the model reads it:
 * the registered tool-result middlewares (for example the egress mediator's
 * model-input chokepoint, which cleans hidden characters and withholds
 * tainted content). Tool results are untrusted input whatever produced them.
 */
export type ToolResultMiddlewareApplier = {
    applyToolResultMiddleware(event: {
        toolCallId: string;
        toolName: string;
        args: Record<string, unknown>;
        isError?: boolean;
        result: AgentToolResult<unknown>;
    }): Promise<AgentToolResult<unknown>>;
};
export type ToToolDefinitionsOptions = {
    /** Context for the per-action gate of tools that were not wrapped with it already. */
    hookContext?: HookContext;
    /** Tool-result middleware for the pi runtime; absent means none runs. */
    resultMiddleware?: ToolResultMiddlewareApplier;
};
export declare function toToolDefinitions(tools: AnyAgentTool[], options?: ToToolDefinitionsOptions): ToolDefinition[];
export declare function toClientToolDefinitions(tools: ClientToolDefinition[], onClientToolCall?: (toolName: string, params: Record<string, unknown>) => void, hookContext?: HookContext): ToolDefinition[];
export {};
