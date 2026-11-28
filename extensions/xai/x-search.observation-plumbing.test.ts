// The x_search declaration survives the plugin path to the call: registered by
// the xAI plugin entry, resolved by the plugin tool resolver, normalized for
// the model, wrapped by the host, and put on the call's replay context.
import { createTestPluginApi } from "@enclawed/plugin-sdk/plugin-test-api";
import { withFetchPreconnect } from "@enclawed/plugin-sdk/test-env";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { wrapToolWithBeforeToolCallHook } from "../../src/agents/pi-tools.before-tool-call.js";
import { normalizeToolParameters } from "../../src/agents/pi-tools.schema.js";
import { currentToolReplayCall } from "../../src/agents/tool-replay.js";
import type { AnyAgentTool } from "../../src/agents/tools/common.js";
import { getGlobalHookRunner } from "../../src/plugins/hook-runner-global.js";
import type { EnclawedPluginToolFactory } from "../../src/plugins/types.js";

const resolveRuntimePluginRegistryMock = vi.fn();

vi.mock("../../src/plugins/loader.js", () => ({
  resolveRuntimePluginRegistry: (params: unknown) => resolveRuntimePluginRegistryMock(params),
}));
vi.mock("../../src/config/plugin-auto-enable.js", () => ({
  applyPluginAutoEnable: ({ config }: { config: unknown }) => ({ config, changes: [] }),
}));
vi.mock("../../src/plugins/hook-runner-global.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/plugins/hook-runner-global.js")>(
    "../../src/plugins/hook-runner-global.js",
  );
  return { ...actual, getGlobalHookRunner: vi.fn() };
});
// The enclawed gates are out of scope: this checks the declaration plumbing.
vi.mock("../../src/enclawed/agent-tool-guard.js", () => ({
  checkHardwareRootForToolCall: () => ({ allowed: true }),
  checkAuditLogForToolCall: async () => ({ allowed: true }),
  planIrreversibleToolCall: async () => ({ kind: "proceed" }),
  resolveIrreversibleApproval: () => true,
}));

const TOOL_OBSERVATION = Symbol.for("enclawed.tool-observation");

const CONFIG = {
  plugins: {
    enabled: true,
    allow: ["xai"],
    entries: { xai: { config: { webSearch: { apiKey: "xai-plumbing-key" } } } }, // pragma: allowlist secret
  },
};

let resolvePluginTools: typeof import("../../src/plugins/tools.js").resolvePluginTools;
let sent: Array<{ method: string; url: string; body: string }>;
const priorFetch = global.fetch;

beforeAll(async () => {
  ({ resolvePluginTools } = await import("../../src/plugins/tools.js"));
});

beforeEach(() => {
  vi.stubEnv("XAI_API_KEY", "");
  sent = [];
  global.fetch = withFetchPreconnect(
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({
        method: String(init?.method),
        url: input instanceof Request ? input.url : String(input),
        body: typeof init?.body === "string" ? init.body : "",
      });
      return new Response(JSON.stringify({ output_text: "ok", citations: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  global.fetch = priorFetch;
  vi.unstubAllEnvs();
});

async function registeredXaiToolEntries() {
  const { default: plugin } = await import("./index.js");
  const entries: Array<{ factory: EnclawedPluginToolFactory; names: string[] }> = [];
  plugin.register(
    createTestPluginApi({
      id: "xai",
      name: "xAI Plugin",
      config: CONFIG as never,
      registerTool: (tool, opts) => {
        // As the registry stores it (`createPluginRegistry().registerTool`).
        const factory: EnclawedPluginToolFactory =
          typeof tool === "function" ? tool : () => tool as AnyAgentTool;
        entries.push({ factory, names: opts?.name ? [opts.name] : [] });
      },
    }),
  );
  return entries;
}

describe("x_search observation through the plugin tool path", () => {
  it("reaches the call's replay context and equals the request execute sends", async () => {
    const entries = await registeredXaiToolEntries();
    resolveRuntimePluginRegistryMock.mockReturnValue({
      tools: entries.map((entry) => ({
        pluginId: "xai",
        pluginName: "xAI Plugin",
        factory: entry.factory,
        names: entry.names,
        optional: false,
        source: "/test/xai/index.ts",
      })),
      diagnostics: [],
    });

    const tools = resolvePluginTools({
      context: { config: CONFIG, workspaceDir: "/tmp" } as never,
    });
    const resolved = tools.find((tool) => tool.name === "x_search");
    if (!resolved) {
      throw new Error(`x_search not resolved: ${tools.map((tool) => tool.name).join(", ")}`);
    }
    // The registered (lazy) tool carries the declaration as an enumerable key.
    expect(Object.getOwnPropertyDescriptor(resolved, TOOL_OBSERVATION)?.enumerable).toBe(true);

    const normalized = normalizeToolParameters(resolved, { modelProvider: "openai" });
    expect(typeof (normalized as unknown as Record<symbol, unknown>)[TOOL_OBSERVATION]).toBe(
      "function",
    );

    let observed: unknown = "unset";
    vi.mocked(getGlobalHookRunner).mockReturnValue({
      hasHooks: (name: string) => name === "before_tool_call",
      runBeforeToolCall: async (event: { params: Record<string, unknown> }) => {
        const observe = currentToolReplayCall()?.observe;
        observed = observe ? await observe(event.params) : undefined;
        return undefined;
      },
    } as never);
    const wrapped = wrapToolWithBeforeToolCallHook(normalized, { runId: "r1" });
    const args = { query: "plumbing check", allowed_x_handles: ["enclawed"] };
    await wrapped.execute("c1", args, undefined, undefined);

    expect(observed).toMatchObject({
      type: "http",
      method: "POST",
      url: "https://api.x.ai/v1/responses",
      read: true,
      client: "x_search",
    });
    const declared = observed as { method: string; url: string; body: string };
    expect(sent).toEqual([{ method: declared.method, url: declared.url, body: declared.body }]);
    expect(JSON.stringify(observed)).not.toContain("xai-plumbing-key");
  });
});
