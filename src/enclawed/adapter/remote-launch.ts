// enclawed adapter kit: remote MCP servers (type http / sse) reached through
// Enclawed's own remote transport (../containment/remote-mcp.ts), never an
// `mcp-remote`-style bridge process.
//
//   admission    a remote server connects only with the `remote` part of its
//                SIGNED admission record (url, transport, the explicitly named
//                authorization origins), and only when the definition the host
//                would use names that same URL and transport. No remote part:
//                refused (mcp-remote-not-admitted).
//   OAuth        the client returns an authorization URL for the adapter's
//                approval UI to show (it is never opened or run), and the
//                adapter hands back the code (exchangeCode). Endpoints off the
//                server's site are refused unless the record names them.
//   tools/call   every call body goes through Enclawed's egress pipeline
//                first (the same stages the containment relay runs); a
//                cancelled body is not sent, a rewritten body is sent as
//                rewritten, a delay is honoured (capped).

import { createEgressRunner, type EgressRunner } from "@enclawed/egress-core";
import {
  RemoteMcpError,
  createRemoteMcpClient,
  type RemoteMcpClient,
  type RemoteMcpOptions,
} from "../containment/index.js";
import type { McpServerDefinition } from "./contracts.js";
import { redactHandles, type BoundCredential } from "./host-env.js";
import type { RemoteCredentials } from "./remote-credentials.js";

/** The remote part of a signed admission record. */
export type McpRemoteRecord = Readonly<{
  url: string;
  transport: "streamable-http" | "sse";
  /** https origins on another site the server's OAuth metadata may name. */
  authorizationOrigins?: readonly string[];
  /** OAuth: the client id the service issued (no dynamic registration), and the scope to ask for. */
  oauth?: Readonly<{ clientId?: string; scope?: string }>;
}>;

export type RemoteRefusal = Readonly<{ ok: false; code: string; message: string }>;

export type RemoteMcpConnection =
  | Readonly<{
      ok: true;
      client: RemoteMcpClient;
      /** tools/call with the body through the egress pipeline first. */
      callTool(
        call: Readonly<{ callId: string; tool: string; arguments: unknown }>,
      ): Promise<unknown>;
    }>
  | RemoteRefusal;

/** Longest delay the egress pipeline may impose on one call (the relay's cap). */
const MAX_PIPELINE_DELAY_MS = 30_000;

const TRANSPORTS: ReadonlySet<string> = new Set(["streamable-http", "sse"]);

/** Is `v` a well-formed remote part of an admission record? */
export function isRemoteRecord(v: unknown): v is McpRemoteRecord {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    return false;
  }
  const r = v as Record<string, unknown>;
  return (
    typeof r.url === "string" &&
    /^https?:\/\//i.test(r.url) &&
    typeof r.transport === "string" &&
    TRANSPORTS.has(r.transport) &&
    (r.authorizationOrigins === undefined ||
      (Array.isArray(r.authorizationOrigins) &&
        r.authorizationOrigins.every((o) => typeof o === "string" && /^https:\/\//i.test(o)))) &&
    (r.oauth === undefined || isOAuthPart(r.oauth))
  );
}

function isOAuthPart(v: unknown): boolean {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    return false;
  }
  const o = v as Record<string, unknown>;
  return (
    Object.keys(o).every((k) => k === "clientId" || k === "scope") &&
    (o.clientId === undefined ||
      (typeof o.clientId === "string" && /^[\x21-\x7e]{1,512}$/.test(o.clientId))) &&
    (o.scope === undefined ||
      (typeof o.scope === "string" && /^[\x20-\x7e]{1,1000}$/.test(o.scope)))
  );
}

/** The transport a host definition asks for ("http" and "streamable-http" are the same; "sse" is the older one). */
export function remoteTransportOf(def: McpServerDefinition): "streamable-http" | "sse" | null {
  const t = (def.type ?? "").toLowerCase();
  if (t === "http" || t === "streamable-http") {
    return "streamable-http";
  }
  return t === "sse" ? "sse" : null;
}

/** Thrown by callTool when Enclawed's egress pipeline refuses the call body. */
export class RemoteCallRefused extends Error {
  override name = "RemoteCallRefused";
  constructor(
    readonly code: "egress-pipeline-cancelled" | "egress-pipeline-error",
    message: string,
  ) {
    super(message);
  }
}

/**
 * Connect an admitted remote MCP server through Enclawed's transport, or
 * refuse. `record` is the verified record's remote part.
 */
export function connectRemoteMcpServer(
  def: McpServerDefinition & Readonly<{ name: string }>,
  record: McpRemoteRecord | null | undefined,
  o: Readonly<{
    egressRunner?: EgressRunner | null;
    connect?: RemoteMcpOptions["connect"];
    timeoutMs?: number;
    /** The definition's headers and the stored OAuth token (./remote-auth.ts remoteCredentials). */
    credentials?: RemoteCredentials | null;
  }> = {},
): RemoteMcpConnection {
  const transport = remoteTransportOf(def);
  if (!transport || typeof def.url !== "string") {
    return {
      ok: false,
      code: "mcp-remote-not-admitted",
      message: `${def.name} is not a remote server`,
    };
  }
  if (!record || !isRemoteRecord(record)) {
    return {
      ok: false,
      code: "mcp-remote-not-admitted",
      message: `${def.name} is not connected: its signed admission record names no remote server`,
    };
  }
  if (record.url !== def.url || record.transport !== transport) {
    return {
      ok: false,
      code: "mcp-remote-url-mismatch",
      message: `${def.name} is not connected: the definition's URL or transport is not the one its admission record signed`,
    };
  }
  const cred = o.credentials ?? null;
  let raw: RemoteMcpClient;
  try {
    // Credentials bound to another server are never handed to this one.
    if (cred && cred.origin !== new URL(record.url).origin) {
      return {
        ok: false,
        code: "remote-credential-mismatch",
        message: `${def.name} is not connected: its credentials are bound to ${cred.origin}`,
      };
    }
    raw = createRemoteMcpClient({
      url: record.url,
      transport: record.transport,
      ...(record.authorizationOrigins ? { authorizationOrigins: record.authorizationOrigins } : {}),
      ...(o.connect ? { connect: o.connect } : {}),
      ...(o.timeoutMs ? { timeoutMs: o.timeoutMs } : {}),
      // The seam asks for headers on the admitted server's own requests only.
      ...(cred ? { requestHeaders: () => cred.headers() } : {}),
    });
  } catch (err) {
    return {
      ok: false,
      code: err instanceof RemoteMcpError ? err.code : "remote-url-invalid",
      message: err instanceof Error ? err.message : String(err),
    };
  }
  const client = withCredentials(raw, cred);
  // No runner given: the pipeline of every stage registered for tool calls
  // (the egress mediator's default). A body is never sent unchecked.
  const runner = o.egressRunner ?? createEgressRunner();
  return {
    ok: true,
    client,
    async callTool(call) {
      let args: unknown = call.arguments;
      if (runner) {
        const body = JSON.stringify({ name: call.tool, arguments: call.arguments ?? {} });
        let result: Awaited<ReturnType<EgressRunner>>;
        try {
          result = await runner(body, {
            kind: "tool-call",
            id: `remote-mcp:${def.name}`,
            toolName: call.tool,
          });
        } catch (err) {
          throw new RemoteCallRefused(
            "egress-pipeline-error",
            `egress pipeline failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        if (result.cancelled) {
          throw new RemoteCallRefused(
            "egress-pipeline-cancelled",
            `egress pipeline refused the call: ${result.reason}`,
          );
        }
        if (result.content !== body) {
          // A rewritten body is sent as rewritten; it must still be a call.
          let parsed: unknown;
          try {
            parsed = JSON.parse(result.content) as unknown;
          } catch {
            throw new RemoteCallRefused(
              "egress-pipeline-error",
              "egress pipeline rewrote the call into something that is not JSON",
            );
          }
          args = (parsed as { arguments?: unknown })?.arguments ?? {};
        }
        if (result.delayMs > 0) {
          await new Promise((r) => setTimeout(r, Math.min(result.delayMs, MAX_PIPELINE_DELAY_MS)));
        }
      }
      return client.callTool(call.tool, args);
    },
  };
}

/** Every string in `v` with the credentials' values removed. */
function redactDeep(v: unknown, handles: readonly BoundCredential[], depth = 0): unknown {
  if (typeof v === "string") {
    return redactHandles(v, handles).text;
  }
  if (depth > 64 || !v || typeof v !== "object") {
    return v;
  }
  if (Array.isArray(v)) {
    return v.map((x) => redactDeep(x, handles, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>).map(([k, x]) => [
      k,
      redactDeep(x, handles, depth + 1),
    ]),
  );
}

/**
 * The client with its credentials applied: an expired access token is
 * refreshed before a request, a request refused for authorization is retried
 * once after a refresh, and no answer carries a credential's value.
 */
function withCredentials(client: RemoteMcpClient, cred: RemoteCredentials | null): RemoteMcpClient {
  if (!cred) {
    return client;
  }
  const run = async <T>(fn: () => Promise<T>): Promise<T> => {
    await cred.refresh();
    let out: T;
    try {
      out = await fn();
    } catch (err) {
      if (
        !(err instanceof RemoteMcpError) ||
        err.code !== "oauth-required" ||
        !(await cred.refresh(true))
      ) {
        throw err;
      }
      out = await fn();
    }
    return redactDeep(out, cred.handles()) as T;
  };
  return {
    ...client,
    initialize: () => run(() => client.initialize()),
    request: (method, params) => run(() => client.request(method, params)),
    listTools: () => run(() => client.listTools()),
    callTool: (name, args) => run(() => client.callTool(name, args)),
  };
}

/** What a probe of a remote server read: its identity and every tool it lists. */
export type RemoteProbe = Readonly<{
  serverInfo: Readonly<{ name: string | null; version: string | null }>;
  protocolVersion: string | null;
  tools: readonly unknown[];
}>;

/** Most tools/list pages a probe reads. */
const MAX_LIST_PAGES = 50;

/**
 * Read a remote server's identity and tools once, through Enclawed's remote
 * transport with the remote part the operator is about to sign (its URL,
 * transport and authorization origins): what an adapter pins. Throws a
 * RemoteMcpError (closed code) or an Error with the refusal.
 */
export async function probeRemoteMcpServer(
  def: McpServerDefinition & Readonly<{ name: string }>,
  record: McpRemoteRecord,
  o: Readonly<{
    connect?: RemoteMcpOptions["connect"];
    timeoutMs?: number;
    credentials?: RemoteCredentials | null;
  }> = {},
): Promise<RemoteProbe> {
  const c = connectRemoteMcpServer(def, record, o);
  if (!c.ok) {
    throw new Error(`${c.message} (${c.code})`);
  }
  try {
    const init = ((await c.client.initialize()) ?? {}) as {
      serverInfo?: { name?: unknown; version?: unknown };
      protocolVersion?: unknown;
    };
    const tools: unknown[] = [];
    let cursor: unknown;
    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      const r = (await c.client.request("tools/list", cursor ? { cursor } : {})) as {
        tools?: unknown;
        nextCursor?: unknown;
      } | null;
      tools.push(...(Array.isArray(r?.tools) ? r.tools : []));
      cursor = r?.nextCursor;
      if (!cursor) {
        break;
      }
    }
    const str = (v: unknown) => (typeof v === "string" ? v : null);
    return {
      serverInfo: { name: str(init.serverInfo?.name), version: str(init.serverInfo?.version) },
      protocolVersion: str(init.protocolVersion),
      tools,
    };
  } finally {
    c.client.close();
  }
}
