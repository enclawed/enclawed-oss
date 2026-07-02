import { describe, expect, it } from "vitest";
import { HttpJsonRpcTransport } from "./http-transport.js";

type FetchCall = Readonly<{
  url: string;
  init: RequestInit;
}>;

function makeFetchStub(
  responder: (call: FetchCall) => Response | Promise<Response>,
): { fetchImpl: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (
    url: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const call = Object.freeze({ url: String(url), init: init ?? {} });
    calls.push(call);
    return responder(call);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("HttpJsonRpcTransport", () => {
  it("rejects non-http endpoints at construction", () => {
    expect(
      () => new HttpJsonRpcTransport({ endpoint: "stdio:///path/to/server" }),
    ).toThrow(/http\(s\):\/\//);
  });

  it("posts a json-rpc envelope with the bearer token from the auth provider", async () => {
    const { fetchImpl, calls } = makeFetchStub(() =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: "x", result: { hello: "world" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const transport = new HttpJsonRpcTransport({
      endpoint: "https://gmailmcp.googleapis.com/mcp/v1",
      authProvider: () => "ya29.test-token",
      fetchImpl,
    });
    const res = await transport.call("tools/call", {
      name: "list_labels",
      arguments: {},
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.result).toEqual({ hello: "world" });
    expect(calls).toHaveLength(1);
    const init = calls[0].init;
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer ya29.test-token");
    expect(headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body as string);
    expect(body.jsonrpc).toBe("2.0");
    expect(body.method).toBe("tools/call");
    expect(body.params).toEqual({ name: "list_labels", arguments: {} });
  });

  it("does not attach an Authorization header when no auth provider is given", async () => {
    const { fetchImpl, calls } = makeFetchStub(() =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: "x", result: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const transport = new HttpJsonRpcTransport({ endpoint: "http://localhost:8744/mcp/v1", fetchImpl });
    const res = await transport.call("ping", {});
    expect(res.ok).toBe(true);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("surfaces non-2xx HTTP responses with status + bounded snippet", async () => {
    const big = "x".repeat(2000);
    const { fetchImpl } = makeFetchStub(() => new Response(big, { status: 401 }));
    const transport = new HttpJsonRpcTransport({
      endpoint: "https://gmailmcp.googleapis.com/mcp/v1",
      authProvider: () => "expired",
      fetchImpl,
    });
    const res = await transport.call("tools/call", { name: "x", arguments: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(401);
      expect(res.reason).toMatch(/^http 401/);
      expect(res.reason.length).toBeLessThan(700); // 512-byte snippet cap
    }
  });

  it("surfaces a json-rpc error envelope", async () => {
    const { fetchImpl } = makeFetchStub(() =>
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "x",
          error: { code: -32601, message: "method not found" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const transport = new HttpJsonRpcTransport({ endpoint: "http://localhost/mcp", fetchImpl });
    const res = await transport.call("tools/call", { name: "x", arguments: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/method not found/);
  });

  it("surfaces auth-provider failures as a reason, never throws", async () => {
    const { fetchImpl } = makeFetchStub(() => new Response("{}", { status: 200 }));
    const transport = new HttpJsonRpcTransport({
      endpoint: "https://gmailmcp.googleapis.com/mcp/v1",
      authProvider: () => {
        throw new Error("no refresh token");
      },
      fetchImpl,
    });
    const res = await transport.call("tools/call", { name: "x", arguments: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/auth provider failed/);
  });
});
