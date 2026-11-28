import type { AgentTool } from "@mariozechner/pi-agent-core";
import { createAgentToolResultMiddlewareRunner } from "../harness/tool-result-middleware.js";
import { toToolDefinitions, type ToToolDefinitionsOptions } from "../pi-tool-definition-adapter.js";

// We always pass tools via `customTools` so our policy filtering, sandbox integration,
// and extended toolset remain consistent across providers.
type AnyAgentTool = AgentTool;

// pi-coding-agent's CreateAgentSessionOptions.tools is an allowlist of tool
// names (string[]) that applies to custom tools as well as built-ins. No
// built-in is enabled; callers pass these names plus every custom tool's name,
// since an allowlist of only these would disable every tool.
export function splitSdkTools(
  options: { tools: AnyAgentTool[]; sandboxEnabled: boolean } & ToToolDefinitionsOptions,
): {
  builtInTools: string[];
  customTools: ReturnType<typeof toToolDefinitions>;
} {
  const { tools, hookContext } = options;
  // Every tool result is untrusted model input, whatever produced it (an MCP
  // server, a web page, a file): the pi runtime's registered tool-result
  // middlewares (the egress mediator's model-input chokepoint among them)
  // run on each one before the model reads it.
  const resultMiddleware =
    options.resultMiddleware ??
    createAgentToolResultMiddlewareRunner({
      runtime: "pi",
      ...(hookContext?.agentId ? { agentId: hookContext.agentId } : {}),
      ...(hookContext?.sessionId ? { sessionId: hookContext.sessionId } : {}),
      ...(hookContext?.sessionKey ? { sessionKey: hookContext.sessionKey } : {}),
      ...(hookContext?.runId ? { runId: hookContext.runId } : {}),
    });
  return {
    builtInTools: [],
    customTools: toToolDefinitions(tools, {
      ...(hookContext ? { hookContext } : {}),
      resultMiddleware,
    }),
  };
}

/**
 * The `tools` allowlist for pi's createAgentSession: the built-in names plus
 * every custom tool's name. pi applies the allowlist to custom tools too, so
 * leaving them out would start the session with no tools at all.
 */
export function sdkActiveToolNames(
  builtInTools: readonly string[],
  customTools: ReadonlyArray<{ name: string }>,
): string[] {
  return [...builtInTools, ...customTools.map((tool) => tool.name)];
}
