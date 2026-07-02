// HTTP(S) + JSON-RPC transport for MCP servers.
//
// Today the Q-cleared MCP client (client.ts) only exposed a `connect()` gate
// — the actual tool dispatch was left as "lab fills in the JSON-RPC client".
// This file fills that gap so the bundled bridges (mcp-google-workspace,
// mcp-github) can dispatch tool calls against real first-party MCP servers
// (Google Workspace remote endpoints, GitHub's official MCP server) without
// each bridge re-implementing JSON-RPC over HTTP.
//
// Wire shape (matches the MCP HTTP transport adopted by Google Workspace
// and the GitHub server):
//
//   POST <serverUrl>
//   Content-Type: application/json
//   Accept: application/json
//   Authorization: Bearer <token>    (when an authProvider is supplied)
//
//   { "jsonrpc": "2.0", "id": "<n>", "method": "tools/call",
//     "params": { "name": "<tool>", "arguments": { ... } } }
//
// The transport stays minimal on purpose: per-bridge concerns (which tools
// are exposed, what OAuth scopes apply, how a refresh-token is exchanged)
// live in the bridge extensions, not here.

export type AuthProvider = () => Promise<string> | string;

export type HttpTransportOptions = Readonly<{
  endpoint: string;
  authProvider?: AuthProvider;
  // Test seam: override the underlying fetch implementation.
  fetchImpl?: typeof fetch;
  // Default request timeout; bridges can override per-call.
  timeoutMs?: number;
}>;

export type JsonRpcOk = Readonly<{ ok: true; result: unknown }>;
export type JsonRpcErr = Readonly<{ ok: false; reason: string; status?: number }>;
export type JsonRpcResult = JsonRpcOk | JsonRpcErr;

let nextRpcId = 1;
function rpcId(): string {
  return `enclawed-mcp-${nextRpcId++}`;
}

export class HttpJsonRpcTransport {
  private readonly endpoint: string;
  private readonly authProvider?: AuthProvider;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: HttpTransportOptions) {
    if (!opts.endpoint || typeof opts.endpoint !== "string") {
      throw new TypeError("HttpJsonRpcTransport: endpoint is required");
    }
    if (!/^https?:\/\//i.test(opts.endpoint)) {
      throw new TypeError(
        `HttpJsonRpcTransport: endpoint must be http(s):// (got "${opts.endpoint}")`,
      );
    }
    this.endpoint = opts.endpoint;
    this.authProvider = opts.authProvider;
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as typeof fetch);
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  async call(method: string, params: Record<string, unknown>): Promise<JsonRpcResult> {
    let bearer: string | undefined;
    if (this.authProvider) {
      try {
        bearer = await this.authProvider();
      } catch (e) {
        return { ok: false, reason: `auth provider failed: ${(e as Error).message}` };
      }
      if (!bearer || typeof bearer !== "string") {
        return { ok: false, reason: "auth provider returned an empty token" };
      }
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (bearer) headers.Authorization = `Bearer ${bearer}`;

    const body = JSON.stringify({ jsonrpc: "2.0", id: rpcId(), method, params });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      return { ok: false, reason: `http transport failed: ${(e as Error).message}` };
    }
    clearTimeout(timer);

    if (!res.ok) {
      // Drain body for diagnostics but keep it bounded so a misbehaving
      // server can't blow memory on the client side.
      let snippet = "";
      try {
        const text = await res.text();
        snippet = text.length > 512 ? `${text.slice(0, 512)}…` : text;
      } catch { /* ignore */ }
      return {
        ok: false,
        status: res.status,
        reason: `http ${res.status}${snippet ? `: ${snippet}` : ""}`,
      };
    }

    let payload: unknown;
    try {
      payload = await res.json();
    } catch (e) {
      return { ok: false, reason: `non-JSON response: ${(e as Error).message}` };
    }
    if (!payload || typeof payload !== "object") {
      return { ok: false, reason: "json-rpc payload is not an object" };
    }
    const env = payload as Record<string, unknown>;
    if ("error" in env && env.error) {
      const err = env.error as Record<string, unknown>;
      const msg = typeof err.message === "string" ? err.message : "unknown rpc error";
      const code = typeof err.code === "number" ? ` (code ${err.code})` : "";
      return { ok: false, reason: `json-rpc error${code}: ${msg}` };
    }
    return { ok: true, result: env.result };
  }
}
