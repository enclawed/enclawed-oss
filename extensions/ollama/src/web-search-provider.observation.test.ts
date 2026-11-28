import type { EnclawedConfig } from "@enclawed/plugin-sdk/config-runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOllamaWebSearchProvider } from "./web-search-provider.js";

const { fetchWithSsrFGuardMock } = vi.hoisted(() => ({
  fetchWithSsrFGuardMock: vi.fn(),
}));

vi.mock("@enclawed/plugin-sdk/ssrf-runtime", () => ({
  fetchWithSsrFGuard: fetchWithSsrFGuardMock,
}));

const TOOL_OBSERVATION = Symbol.for("enclawed.tool-observation");

type Declare = (args: Record<string, unknown>) => unknown;
type Sent = { method: string; url: string; body: string };

function ollamaConfig(baseUrl = "http://ollama.local:11434/v1", apiKey?: string): EnclawedConfig {
  return {
    models: {
      providers: {
        ollama: { baseUrl, api: "ollama", models: [], ...(apiKey ? { apiKey } : {}) },
      },
    },
  };
}

function createTool(config: EnclawedConfig = ollamaConfig()) {
  const tool = createOllamaWebSearchProvider().createTool({ config } as never);
  if (!tool) {
    throw new Error("Expected tool definition");
  }
  const declare = (tool as unknown as Record<symbol, unknown>)[TOOL_OBSERVATION];
  if (typeof declare !== "function") {
    throw new Error("Expected a declared observation");
  }
  return { tool, declare: declare as Declare };
}

function sentRequests(): Sent[] {
  return fetchWithSsrFGuardMock.mock.calls.map((call) => {
    const arg = call[0] as { url: string; init: RequestInit };
    return {
      method: String(arg.init.method),
      url: arg.url,
      body: typeof arg.init.body === "string" ? arg.init.body : "",
    };
  });
}

describe("ollama web_search observation", () => {
  beforeEach(() => {
    fetchWithSsrFGuardMock.mockReset();
    fetchWithSsrFGuardMock.mockImplementation(async () => ({
      response: new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
      release: async () => {},
    }));
  });

  it("is enumerable on the tool definition and declares the POST to the Ollama host", () => {
    const { tool, declare } = createTool();
    expect(Object.getOwnPropertyDescriptor(tool, TOOL_OBSERVATION)?.enumerable).toBe(true);
    expect(declare({ query: "enclawed", count: 3 })).toEqual({
      type: "http",
      method: "POST",
      url: "http://ollama.local:11434/api/experimental/web_search",
      body: JSON.stringify({ query: "enclawed", max_results: 3 }),
      read: true,
      client: "web_search:ollama",
    });
  });

  it("gives the same observation for calls that differ only off the wire", () => {
    const { declare } = createTool(ollamaConfig("http://ollama.local:11434/v1", "ollama-secret"));
    const base = declare({ query: "same", count: 4 });
    expect(declare({ query: "  same ", count: 4.8, extra: 1 })).toEqual(base);
    expect(declare({ query: "same", count: "4" })).toEqual(base);
    expect(declare({ query: "same", count: 99 })).toEqual(declare({ query: "same", count: 10 }));
    expect(declare({ query: "same" })).toEqual(declare({ query: "same", count: 5 }));
    expect(JSON.stringify(base)).not.toContain("ollama-secret");
  });

  it("changes with every parameter and config value that reaches the wire", () => {
    const { declare } = createTool();
    const base = declare({ query: "q", count: 2 });
    expect(declare({ query: "q2", count: 2 })).not.toEqual(base);
    expect(declare({ query: "q", count: 3 })).not.toEqual(base);
    expect(
      createTool(ollamaConfig("http://other.local:11434")).declare({ query: "q", count: 2 }),
    ).not.toEqual(base);
  });

  it("equals the request execute sends", async () => {
    const { tool, declare } = createTool();
    for (const args of [{ query: "ollama wire", count: 2 }, { query: "  ollama default " }]) {
      fetchWithSsrFGuardMock.mockClear();
      await tool.execute(args);
      const declared = declare(args) as Sent;
      expect(sentRequests()).toEqual([
        { method: declared.method, url: declared.url, body: declared.body },
      ]);
    }
  });

  it("throws where execute fails before sending", async () => {
    const { tool, declare } = createTool();
    for (const args of [{}, { query: "   " }, { query: 3 }]) {
      await expect(tool.execute(args)).rejects.toThrow(/query/);
      expect(() => declare(args)).toThrow(/query/);
    }
    expect(fetchWithSsrFGuardMock).not.toHaveBeenCalled();
  });
});
