import type { AgentTool } from "@mariozechner/pi-agent-core";
import { toToolDefinitions, type ToToolDefinitionsOptions } from "../pi-tool-definition-adapter.js";
type AnyAgentTool = AgentTool;
export declare function splitSdkTools(options: {
    tools: AnyAgentTool[];
    sandboxEnabled: boolean;
} & ToToolDefinitionsOptions): {
    builtInTools: string[];
    customTools: ReturnType<typeof toToolDefinitions>;
};
/**
 * The `tools` allowlist for pi's createAgentSession: the built-in names plus
 * every custom tool's name. pi applies the allowlist to custom tools too, so
 * leaving them out would start the session with no tools at all.
 */
export declare function sdkActiveToolNames(builtInTools: readonly string[], customTools: ReadonlyArray<{
    name: string;
}>): string[];
export {};
