import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveRequestUrl } from "../../plugin-sdk/request-url.js";
import { withFetchPreconnect } from "../../test-utils/fetch-mock.js";
import { makeFetchHeaders } from "./web-fetch.test-harness.js";
import "./web-fetch.test-mocks.js";

// The egress action batcher pads a window of web_fetch calls with dummy GETs
// sent through web_fetch's own published client. A dummy is only cover if it
// leaves exactly like a real fetch: these tests pin that down.

type Slot = {
  clients: Map<
    string,
    {
      check(url: string): Promise<{ ok: true } | { ok: false; reason: string }>;
      send(url: string): Promise<void>;
    }
  >;
  listeners: Set<(tool: string, url: string) => void>;
};
const slot = () =>
  (globalThis as unknown as Record<symbol, Slot | undefined>)[
    Symbol.for("enclawed.tool-request-client")
  ];

const lookupMock = vi.fn(async (hostname: string) =>
  hostname === "private.test"
    ? [{ address: "10.0.0.5", family: 4 }]
    : [{ address: "93.184.216.34", family: 4 }],
);

function textResponse(body: string): Response {
  return {
    ok: true,
    status: 200,
    headers: makeFetchHeaders({ "content-type": "text/plain" }),
    text: async () => body,
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  } as unknown as Response;
}

async function buildTool(ssrfPolicy?: { allowRfc2544BenchmarkRange?: boolean }) {
  const { createWebFetchTool } = await import("./web-tools.js");
  return createWebFetchTool({
    config: { tools: { web: { fetch: { cacheTtlMinutes: 0, ssrfPolicy } } } },
    lookupFn: lookupMock as never,
  });
}

describe("web_fetch request client (padding path)", () => {
  const priorFetch = global.fetch;
  afterEach(() => {
    global.fetch = priorFetch;
    slot()?.clients.delete("web_fetch");
    slot()?.listeners.clear();
    vi.restoreAllMocks();
  });

  it("sends padding with exactly the headers of a real web_fetch", async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    global.fetch = withFetchPreconnect(
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({
          url: resolveRequestUrl(input),
          headers: Object.fromEntries(new Headers(init?.headers).entries()),
        });
        return textResponse("ok");
      }),
    );
    const tool = await buildTool();
    await tool?.execute?.("call-1", { url: "https://public.test/a", extractMode: "text" });
    const client = slot()?.clients.get("web_fetch");
    expect(client).toBeDefined();
    await client!.send("https://public.test/b");
    expect(calls).toHaveLength(2);
    expect(calls[1].headers).toEqual(calls[0].headers);
    expect(calls[0].headers["user-agent"]).toBeTruthy();
  });

  it("reports a real fetch as issued before it leaves", async () => {
    const events: string[] = [];
    global.fetch = withFetchPreconnect(
      vi.fn(async (input: RequestInfo | URL) => {
        events.push(`fetch ${resolveRequestUrl(input)}`);
        return textResponse("ok");
      }),
    );
    const tool = await buildTool();
    slot()?.listeners.add((name, url) => events.push(`issued ${name} ${url}`));
    await tool?.execute?.("call-1", { url: "https://public.test/a" });
    expect(events[0]).toBe("issued web_fetch https://public.test/a");
    expect(events[1]).toContain("fetch https://public.test/a");
  });

  it("checks padding against web_fetch's own SSRF policy without sending", async () => {
    const fetchSpy = vi.fn(async () => textResponse("ok"));
    global.fetch = withFetchPreconnect(fetchSpy);
    await buildTool();
    const client = slot()!.clients.get("web_fetch")!;
    expect(await client.check("https://public.test/a")).toEqual({ ok: true });
    expect((await client.check("http://127.0.0.1/a")).ok).toBe(false);
    expect((await client.check("https://private.test/a")).ok).toBe(false);
    expect((await client.check("http://198.18.0.1/a")).ok).toBe(false);
    expect((await client.check("file:///etc/passwd")).ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();

    await buildTool({ allowRfc2544BenchmarkRange: true });
    expect(await slot()!.clients.get("web_fetch")!.check("http://198.18.0.1/a")).toEqual({
      ok: true,
    });
  });
});
