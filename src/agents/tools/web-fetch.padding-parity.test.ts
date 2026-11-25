import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveRequestUrl } from "../../plugin-sdk/request-url.js";
import { withFetchPreconnect } from "../../test-utils/fetch-mock.js";

// Hypothesis H1 of the choice-channel defense, in code (skeptic review C3): a
// padding dummy is indistinguishable from a real web_fetch of the same URL,
// on the wire and in the receiver's and the fallback provider's view. Each
// case serves the same response to a real fetch and to a dummy and compares
// everything an observer can see: the request (URL, method, headers, redirect
// mode, DNS lookups), how much of the body was read and whether the read was
// cancelled, and whether the provider fallback was asked, with what.

const { resolveWebFetchDefinitionMock } = vi.hoisted(() => ({
  resolveWebFetchDefinitionMock: vi.fn(),
}));
vi.mock("../../web-fetch/runtime.js", () => ({
  resolveWebFetchDefinition: resolveWebFetchDefinitionMock,
}));

type Observation = {
  requests: Array<{
    url: string;
    method: string;
    headers: Record<string, string>;
    redirect?: string;
  }>;
  lookups: string[];
  bytesRead: number;
  cancelled: boolean;
  provider: Array<{ url: string; extractMode: string; maxChars: number }>;
};

type Serve = { status: number; size: number; contentType: string } | { networkError: true };

const slot = () =>
  (
    globalThis as unknown as Record<
      symbol,
      { clients: Map<string, { send(url: string): Promise<void> }> } | undefined
    >
  )[Symbol.for("enclawed.tool-request-client")];

/** A streaming body that counts what the client pulls and sees a cancel. */
function streamingResponse(serve: Extract<Serve, { status: number }>, obs: Observation): Response {
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (sent >= serve.size) {
          controller.close();
          return;
        }
        const n = Math.min(16_384, serve.size - sent);
        sent += n;
        obs.bytesRead = sent;
        controller.enqueue(new Uint8Array(n).fill(0x61));
      },
      cancel() {
        obs.cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return new Response(stream, {
    status: serve.status,
    headers: { "content-type": serve.contentType },
  });
}

function providerDefinition(obs: Observation) {
  return {
    provider: { id: "fallback-provider" },
    definition: {
      description: "fallback",
      parameters: {},
      execute: async (args: { url: string; extractMode: string; maxChars: number }) => {
        obs.provider.push({
          url: args.url,
          extractMode: args.extractMode,
          maxChars: args.maxChars,
        });
        return { text: "provider text" };
      },
    },
  };
}

async function observe(
  serve: Serve,
  mode: "real" | "dummy",
  withProvider: boolean,
  shaping: Record<string, unknown> = {},
): Promise<Observation> {
  const obs: Observation = {
    requests: [],
    lookups: [],
    bytesRead: 0,
    cancelled: false,
    provider: [],
  };
  global.fetch = withFetchPreconnect(
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      obs.requests.push({
        url: resolveRequestUrl(input),
        method: init?.method ?? "GET",
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        redirect: init?.redirect,
      });
      if ("networkError" in serve) {
        throw new Error("connection reset");
      }
      return streamingResponse(serve, obs);
    }),
  );
  resolveWebFetchDefinitionMock.mockReturnValue(withProvider ? providerDefinition(obs) : null);
  const lookupFn = vi.fn(async (hostname: string) => {
    obs.lookups.push(hostname);
    return [{ address: "93.184.216.34", family: 4 }];
  });
  const { createWebFetchTool } = await import("./web-tools.js");
  const tool = createWebFetchTool({
    config: { tools: { web: { fetch: { cacheTtlMinutes: 0 } } } },
    lookupFn: lookupFn as never,
  });
  const url = "https://receiver.test/item/7";
  if (mode === "real") {
    await tool!.execute("call-real", { url, ...shaping }).catch(() => undefined);
  } else {
    await slot()!.clients.get("web_fetch")!.send(url);
  }
  // Let a cancelled read settle.
  await new Promise((resolve) => setTimeout(resolve, 5));
  return obs;
}

describe("web_fetch padding parity (H1)", () => {
  const priorFetch = global.fetch;
  beforeEach(() => {
    resolveWebFetchDefinitionMock.mockReset();
  });
  afterEach(() => {
    global.fetch = priorFetch;
    slot()?.clients.delete("web_fetch");
    vi.restoreAllMocks();
  });

  const cases: Array<[string, Serve]> = [
    [
      "a body larger than maxResponseBytes (read to the limit, then cancel)",
      { status: 200, size: 2_000_000, contentType: "text/plain" },
    ],
    [
      "an error answer with a large body (error-body limit, then cancel)",
      { status: 404, size: 300_000, contentType: "text/plain" },
    ],
    ["a small page", { status: 200, size: 2_000, contentType: "text/plain" }],
    [
      "an error answer that triggers the provider fallback",
      { status: 503, size: 1_000, contentType: "text/html" },
    ],
    ["a network error that triggers the provider fallback", { networkError: true }],
  ];

  for (const [name, serve] of cases) {
    it(`a dummy and a real fetch look the same: ${name}`, async () => {
      const withProvider = name.includes("fallback");
      const r = await observe(serve, "real", withProvider);
      const d = await observe(serve, "dummy", withProvider);
      expect(d.requests).toEqual(r.requests);
      expect(d.lookups).toEqual(r.lookups);
      expect(d.bytesRead).toBe(r.bytesRead);
      expect(d.cancelled).toBe(r.cancelled);
      expect(d.provider).toEqual(r.provider);
      expect(r.requests).toHaveLength(1);
      if ("status" in serve && serve.size > 64_000) {
        // The real read stops at its limit and cancels; so must the dummy.
        expect(r.bytesRead).toBeLessThan(serve.size);
        expect(r.cancelled).toBe(true);
      }
      if (name.includes("fallback")) {
        expect(r.provider).toHaveLength(1);
      }
    });
  }

  it("the fallback provider cannot tell a shaped real call from a dummy", async () => {
    // Residual 4: the provider request never carries result shaping.
    const serve: Serve = { networkError: true };
    const r = await observe(serve, "real", true, { extractMode: "text", maxChars: 500 });
    const d = await observe(serve, "dummy", true);
    expect(r.provider).toHaveLength(1);
    expect(d.provider).toEqual(r.provider);
  });
});
