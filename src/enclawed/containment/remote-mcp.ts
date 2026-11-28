// Enclawed's own remote MCP transport (row 10): an MCP client for servers
// reached over HTTP (Streamable HTTP, and the older HTTP+SSE transport),
// run by Enclawed itself, so no `mcp-remote`-style bridge process is
// started to reach a remote server.
//
// mcp-remote before 0.1.16 (CVE-2025-6514) took the authorization_endpoint
// of a server's OAuth metadata and handed it to an "open the browser"
// helper that ran it: a malicious server got code execution on the user's
// machine. Here:
//
//   - nothing is opened or run: an authorization URL is RETURNED (built
//     only from a validated endpoint) for the host's UI to show;
//   - the OAuth origin rule: every endpoint taken from metadata (the
//     protected-resource metadata, the authorization server's issuer,
//     authorization, token, registration, revocation and introspection
//     endpoints) must be an https URL, with no credentials in it, whose host
//     is SAME-SITE as the admitted server URL (the same registrable domain
//     under the Public Suffix List, or the same IP address), or an https
//     origin the admission record names explicitly. Anything else, and every
//     scheme that is not https (file:, javascript:, data:, a shell command),
//     is refused before it is used;
//   - PKCE (S256) is required;
//   - the access token is sent only to the admitted server's origin, and
//     redirects are never followed (a redirect would carry it elsewhere);
//   - for the HTTP+SSE transport, the POST endpoint the server announces
//     must have the server URL's origin.
// Every refusal is a RemoteMcpError with a closed code.

import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { PUBLIC_SUFFIX_RULES } from "./public-suffixes.js";

export type RemoteRefusalCode =
  | "remote-url-invalid"
  | "remote-scheme-refused"
  | "oauth-endpoint-not-https"
  | "oauth-endpoint-cross-site"
  | "oauth-metadata-invalid"
  | "oauth-pkce-unsupported"
  | "oauth-required"
  | "sse-endpoint-cross-origin"
  | "redirect-refused"
  | "remote-http-error"
  | "remote-protocol-error"
  | "remote-response-too-large";

export class RemoteMcpError extends Error {
  override name = "RemoteMcpError";
  constructor(
    readonly code: RemoteRefusalCode,
    message: string,
  ) {
    super(`Enclawed remote MCP: ${message}`);
  }
}

// ─── Same-site ──────────────────────────────────────────────────────────

const exact = new Set<string>();
const wildcard = new Set<string>();
const exception = new Set<string>();
for (const r of PUBLIC_SUFFIX_RULES) {
  if (r.startsWith("!")) {
    exception.add(r.slice(1));
  } else if (r.startsWith("*.")) {
    wildcard.add(r.slice(2));
  } else {
    exact.add(r);
  }
}

/** The registrable domain (eTLD+1) of a DNS name; null for a public suffix itself. */
export function registrableDomain(hostname: string): string | null {
  const labels = hostname.toLowerCase().replace(/\.$/, "").split(".");
  if (labels.some((l) => l === "")) {
    return null;
  }
  // Longest public suffix: exception rules win, then the longest of exact
  // and wildcard rules, else the implicit "*" (the last label).
  let suffixLen = 1;
  for (let i = 0; i < labels.length; i++) {
    const candidate = labels.slice(i).join(".");
    if (exception.has(candidate)) {
      suffixLen = labels.length - i - 1;
      break;
    }
    const n = labels.length - i;
    if (exact.has(candidate) && n > suffixLen) {
      suffixLen = n;
    }
    if (i + 1 < labels.length && wildcard.has(labels.slice(i + 1).join(".")) && n > suffixLen) {
      suffixLen = n;
    }
  }
  if (labels.length <= suffixLen) {
    return null;
  }
  return labels.slice(labels.length - suffixLen - 1).join(".");
}

const bareHost = (h: string) => h.toLowerCase().replace(/^\[|\]$/g, "");

/** Same site: the same IP address, or the same (non-null) registrable domain. */
export function sameSite(a: string, b: string): boolean {
  const x = bareHost(a);
  const y = bareHost(b);
  if (net.isIP(x) || net.isIP(y)) {
    return x === y;
  }
  const rx = registrableDomain(x);
  return rx !== null && rx === registrableDomain(y);
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);

/** The admitted server URL: https (http only on the loopback), no credentials. */
export function checkServerUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new RemoteMcpError("remote-url-invalid", `not a URL: ${raw}`);
  }
  if (u.protocol !== "https:" && !(u.protocol === "http:" && LOOPBACK.has(bareHost(u.hostname)))) {
    throw new RemoteMcpError(
      "remote-scheme-refused",
      `a remote MCP server must be reached over https (got ${u.protocol})`,
    );
  }
  if (u.username || u.password) {
    throw new RemoteMcpError("remote-url-invalid", "a server URL may not carry credentials");
  }
  return u;
}

/**
 * The OAuth origin rule for one endpoint taken from metadata. `extraOrigins`:
 * https origins the admission record names (an authorization server on
 * another site, declared by the operator).
 */
export function checkOAuthEndpoint(
  server: URL,
  field: string,
  raw: unknown,
  extraOrigins: readonly string[] = [],
): URL {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 4096) {
    throw new RemoteMcpError("oauth-metadata-invalid", `${field} is missing or not a string`);
  }
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new RemoteMcpError(
      "oauth-endpoint-not-https",
      `${field} is not an https URL: ${raw.slice(0, 200)}`,
    );
  }
  if (u.protocol !== "https:") {
    throw new RemoteMcpError(
      "oauth-endpoint-not-https",
      `${field} must be an https URL; "${u.protocol}" is refused: ${raw.slice(0, 200)}`,
    );
  }
  if (u.username || u.password) {
    throw new RemoteMcpError("oauth-endpoint-not-https", `${field} may not carry credentials`);
  }
  if (sameSite(u.hostname, server.hostname) || extraOrigins.includes(u.origin)) {
    return u;
  }
  throw new RemoteMcpError(
    "oauth-endpoint-cross-site",
    `${field} ${u.origin} is not on the site of the admitted server ${server.origin}`,
  );
}

export type AuthorizationEndpoints = Readonly<{
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string | null;
}>;

/** Validate authorization-server metadata (RFC 8414) against the admitted server. */
export function validateAuthorizationMetadata(
  server: URL,
  meta: unknown,
  expectedIssuer: string | null,
  extraOrigins: readonly string[] = [],
): AuthorizationEndpoints {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    throw new RemoteMcpError(
      "oauth-metadata-invalid",
      "authorization server metadata is not an object",
    );
  }
  const m = meta as Record<string, unknown>;
  const issuer = checkOAuthEndpoint(server, "issuer", m.issuer, extraOrigins);
  if (
    expectedIssuer !== null &&
    issuer.href.replace(/\/$/, "") !== expectedIssuer.replace(/\/$/, "")
  ) {
    throw new RemoteMcpError(
      "oauth-metadata-invalid",
      `metadata issuer ${issuer.href} is not the authorization server ${expectedIssuer}`,
    );
  }
  const authorizationEndpoint = checkOAuthEndpoint(
    server,
    "authorization_endpoint",
    m.authorization_endpoint,
    extraOrigins,
  );
  const tokenEndpoint = checkOAuthEndpoint(
    server,
    "token_endpoint",
    m.token_endpoint,
    extraOrigins,
  );
  const registrationEndpoint =
    m.registration_endpoint === undefined
      ? null
      : checkOAuthEndpoint(server, "registration_endpoint", m.registration_endpoint, extraOrigins);
  for (const f of [
    "revocation_endpoint",
    "introspection_endpoint",
    "userinfo_endpoint",
    "jwks_uri",
  ]) {
    if (m[f] !== undefined) {
      checkOAuthEndpoint(server, f, m[f], extraOrigins);
    }
  }
  const pkce = m.code_challenge_methods_supported;
  if (!Array.isArray(pkce) || !pkce.includes("S256")) {
    throw new RemoteMcpError(
      "oauth-pkce-unsupported",
      "the authorization server does not offer PKCE with S256",
    );
  }
  return {
    issuer: issuer.href,
    authorizationEndpoint: authorizationEndpoint.href,
    tokenEndpoint: tokenEndpoint.href,
    registrationEndpoint: registrationEndpoint?.href ?? null,
  };
}

// ─── HTTP ───────────────────────────────────────────────────────────────

/** Largest response the client reads. */
const MAX_RESPONSE = 16 * 1024 * 1024;

export type RemoteConnect = (
  host: string,
  port: number,
) => { host: string; port: number; ca?: string | Buffer };

type Response = { status: number; headers: http.IncomingHttpHeaders; body: http.IncomingMessage };

function send(
  url: URL,
  init: { method: string; headers: Record<string, string>; body?: string },
  connect: RemoteConnect | undefined,
  timeoutMs: number,
): Promise<Response> {
  const port = Number(url.port) || (url.protocol === "https:" ? 443 : 80);
  const host = bareHost(url.hostname);
  const target = connect?.(host, port) ?? { host, port };
  const lib = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request({
      host: target.host,
      port: target.port,
      method: init.method,
      path: `${url.pathname}${url.search}`,
      headers: { ...init.headers, host: url.host },
      ...(url.protocol === "https:"
        ? { servername: net.isIP(host) ? undefined : host, ...(target.ca ? { ca: target.ca } : {}) }
        : {}),
      agent: false,
      timeout: timeoutMs,
    });
    req.on("response", (res) =>
      resolve({ status: res.statusCode ?? 0, headers: res.headers, body: res }),
    );
    req.on("timeout", () => req.destroy(new Error(`timed out after ${timeoutMs} ms`)));
    req.on("error", reject);
    req.end(init.body);
  });
}

function readAll(res: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    res.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_RESPONSE) {
        res.destroy();
        reject(
          new RemoteMcpError(
            "remote-response-too-large",
            `response larger than ${MAX_RESPONSE} bytes`,
          ),
        );
        return;
      }
      chunks.push(c);
    });
    res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    res.on("error", reject);
  });
}

type SseEvent = { event: string; data: string };

/** Server-sent events from a response, one callback per event; resolves at the end of the stream. */
function readSse(
  res: http.IncomingMessage,
  onEvent: (e: SseEvent) => boolean | void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let buf = "";
    let size = 0;
    let event = "message";
    let data: string[] = [];
    let stopped = false;
    const dispatch = () => {
      if (data.length > 0 && !stopped && onEvent({ event, data: data.join("\n") }) === true) {
        stopped = true;
        res.destroy();
        resolve();
      }
      event = "message";
      data = [];
    };
    res.setEncoding("utf8");
    res.on("data", (chunk: string) => {
      size += chunk.length;
      if (size > MAX_RESPONSE) {
        res.destroy();
        reject(
          new RemoteMcpError(
            "remote-response-too-large",
            `event stream larger than ${MAX_RESPONSE} bytes`,
          ),
        );
        return;
      }
      buf += chunk;
      for (;;) {
        // `stopped` is set by dispatch() when the wanted event has arrived.
        const nl = stopped ? -1 : buf.search(/\r\n|\r|\n/);
        if (nl < 0) {
          break;
        }
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + (buf.startsWith("\r\n", nl) ? 2 : 1));
        if (line === "") {
          dispatch();
        } else if (line.startsWith(":")) {
          continue;
        } else {
          const i = line.indexOf(":");
          const field = i < 0 ? line : line.slice(0, i);
          const value = i < 0 ? "" : line.slice(i + 1).replace(/^ /, "");
          if (field === "event") {
            event = value;
          } else if (field === "data") {
            data.push(value);
          }
        }
      }
    });
    res.on("end", () => {
      dispatch();
      resolve();
    });
    res.on("error", (err) => (stopped ? resolve() : reject(err)));
  });
}

// ─── The client ─────────────────────────────────────────────────────────

export type RemoteMcpOptions = Readonly<{
  /** The server URL the admission record names. */
  url: string;
  /** Authorization-server origins (https) on another site, named in the admission record. */
  authorizationOrigins?: readonly string[];
  /** "streamable-http" (default) or the older "sse" transport. */
  transport?: "streamable-http" | "sse";
  /** Where to connect for a host (tests: a local stand-in) and the trust to use. */
  connect?: RemoteConnect;
  timeoutMs?: number;
  clientInfo?: Readonly<{ name: string; version: string }>;
  /**
   * Extra headers (the session's own authorization, a tenant header), asked
   * for on every request to the admitted server and only there: the POSTs
   * and the SSE stream, never the metadata, token or registration endpoints,
   * and never after a redirect (redirects are not followed).
   */
  requestHeaders?: () => Readonly<Record<string, string>>;
}>;

/** Headers the transport sets itself; a caller may not set them. */
const RESERVED_HEADERS = new Set([
  "host",
  "content-type",
  "accept",
  "mcp-session-id",
  "mcp-protocol-version",
  "content-length",
]);

/** The caller's headers, validated; anything else throws remote-protocol-error. */
export function validRequestHeaders(h: unknown): Record<string, string> {
  if (!h || typeof h !== "object" || Array.isArray(h)) {
    throw new RemoteMcpError("remote-protocol-error", "requestHeaders must return an object");
  }
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(h as Record<string, unknown>)) {
    if (!/^[A-Za-z0-9-]{1,64}$/.test(name) || RESERVED_HEADERS.has(name.toLowerCase())) {
      throw new RemoteMcpError(
        "remote-protocol-error",
        `request header name refused: ${JSON.stringify(name).slice(0, 80)}`,
      );
    }
    if (typeof value !== "string" || !/^[\x20-\x7e]{1,8192}$/.test(value)) {
      throw new RemoteMcpError(
        "remote-protocol-error",
        `request header ${name} has a value that is not printable ASCII (1 to 8192 characters)`,
      );
    }
    out[name.toLowerCase()] = value;
  }
  return out;
}

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
};

const b64url = (b: Buffer) =>
  b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function createRemoteMcpClient(opts: RemoteMcpOptions) {
  const server = checkServerUrl(opts.url);
  const extra = (opts.authorizationOrigins ?? []).map((o) => checkServerUrl(o).origin);
  const timeoutMs = opts.timeoutMs ?? 30_000;
  let sessionId: string | null = null;
  let protocolVersion: string | null = null;
  let accessToken: string | null = null;
  let nextId = 1;
  // HTTP+SSE transport: the announced POST endpoint and the pending answers.
  let ssePost: URL | null = null;
  let sseStream: http.IncomingMessage | null = null;
  const ssePending = new Map<number | string, (r: JsonRpcResponse) => void>();

  // Asked for each time: only ever for the admitted server's origin.
  const callerHeaders = () =>
    opts.requestHeaders ? validRequestHeaders(opts.requestHeaders()) : {};
  const baseHeaders = (): Record<string, string> => ({
    ...callerHeaders(),
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    ...(protocolVersion ? { "mcp-protocol-version": protocolVersion } : {}),
    // The token goes to the admitted server's origin only (every POST below targets it).
    ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
  });

  const refuseRedirect = (res: Response, what: string) => {
    if (res.status >= 300 && res.status < 400) {
      res.body.resume();
      throw new RemoteMcpError(
        "redirect-refused",
        `${what} answered with a redirect (${res.status} to ${res.headers.location ?? ""}); redirects are not followed`,
      );
    }
  };

  const getJson = async (url: URL, what: string): Promise<unknown> => {
    const res = await send(
      url,
      { method: "GET", headers: { accept: "application/json" } },
      opts.connect,
      timeoutMs,
    );
    refuseRedirect(res, what);
    const text = await readAll(res.body);
    if (res.status !== 200) {
      throw new RemoteMcpError("remote-http-error", `${what}: HTTP ${res.status}`);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new RemoteMcpError("oauth-metadata-invalid", `${what} is not JSON`);
    }
  };

  /** The OAuth endpoints for this server, discovered and checked (MCP authorization, RFC 9728 + RFC 8414). */
  const discoverAuthorization = async (
    wwwAuthenticate?: string,
  ): Promise<AuthorizationEndpoints> => {
    let issuer: URL;
    const rm = wwwAuthenticate ? /resource_metadata="([^"]+)"/.exec(wwwAuthenticate) : null;
    if (rm) {
      const prmUrl = checkOAuthEndpoint(server, "resource_metadata", rm[1], extra);
      const prm = (await getJson(prmUrl, "protected resource metadata")) as Record<
        string,
        unknown
      > | null;
      const servers =
        prm && Array.isArray(prm.authorization_servers) ? prm.authorization_servers : [];
      if (servers.length === 0) {
        throw new RemoteMcpError(
          "oauth-metadata-invalid",
          "protected resource metadata names no authorization server",
        );
      }
      issuer = checkOAuthEndpoint(server, "authorization_servers[0]", servers[0], extra);
    } else {
      issuer = new URL(server.origin);
    }
    // RFC 8414: the well-known suffix goes between the host and the issuer's path.
    const wellKnown = new URL(
      `/.well-known/oauth-authorization-server${issuer.pathname === "/" ? "" : issuer.pathname.replace(/\/$/, "")}`,
      issuer.origin,
    );
    const meta = await getJson(wellKnown, "authorization server metadata");
    return validateAuthorizationMetadata(server, meta, rm ? issuer.href : null, extra);
  };

  const parseResponse = (text: string, id: number | string): JsonRpcResponse => {
    let msg: unknown;
    try {
      msg = JSON.parse(text) as unknown;
    } catch {
      throw new RemoteMcpError("remote-protocol-error", "the server's answer is not JSON");
    }
    const list = Array.isArray(msg) ? msg : [msg];
    const found = list.find(
      (m): m is JsonRpcResponse => !!m && typeof m === "object" && (m as JsonRpcResponse).id === id,
    );
    if (!found) {
      throw new RemoteMcpError("remote-protocol-error", `no answer to request ${id}`);
    }
    return found;
  };

  const post = async (
    body: unknown,
    id: number | string | null,
  ): Promise<JsonRpcResponse | null> => {
    const target = opts.transport === "sse" ? ssePost : server;
    if (!target) {
      throw new RemoteMcpError("remote-protocol-error", "the SSE transport is not connected");
    }
    const res = await send(
      target,
      { method: "POST", headers: baseHeaders(), body: JSON.stringify(body) },
      opts.connect,
      timeoutMs,
    );
    refuseRedirect(res, "the server");
    if (res.status === 401) {
      res.body.resume();
      const endpoints = await discoverAuthorization(
        typeof res.headers["www-authenticate"] === "string"
          ? res.headers["www-authenticate"]
          : undefined,
      );
      throw Object.assign(
        new RemoteMcpError(
          "oauth-required",
          `the server requires authorization at ${endpoints.authorizationEndpoint}`,
        ),
        { endpoints },
      );
    }
    const sid = res.headers["mcp-session-id"];
    if (typeof sid === "string" && /^[\x21-\x7e]{1,256}$/.test(sid)) {
      sessionId = sid;
    }
    if (id === null || opts.transport === "sse") {
      const text = await readAll(res.body);
      if (res.status >= 400) {
        throw new RemoteMcpError("remote-http-error", `HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      return null;
    }
    if (res.status >= 400) {
      const text = await readAll(res.body);
      throw new RemoteMcpError("remote-http-error", `HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const ct = res.headers["content-type"] ?? "";
    if (ct.startsWith("text/event-stream")) {
      let answer: JsonRpcResponse | null = null;
      await readSse(res.body, (e) => {
        try {
          answer = parseResponse(e.data, id);
          return true;
        } catch {
          return false; // a notification or a server request: not the answer
        }
      });
      if (!answer) {
        throw new RemoteMcpError(
          "remote-protocol-error",
          `the event stream ended without an answer to ${id}`,
        );
      }
      return answer;
    }
    return parseResponse(await readAll(res.body), id);
  };

  const request = async (method: string, params: unknown): Promise<unknown> => {
    const id = nextId++;
    const msg = { jsonrpc: "2.0", id, method, params };
    let r: JsonRpcResponse | null;
    if (opts.transport === "sse") {
      const answer = new Promise<JsonRpcResponse>((resolve, reject) => {
        ssePending.set(id, resolve);
        setTimeout(() => {
          ssePending.delete(id);
          reject(
            new RemoteMcpError(
              "remote-protocol-error",
              `no answer to ${method} in ${timeoutMs} ms`,
            ),
          );
        }, timeoutMs).unref();
      });
      await post(msg, id);
      r = await answer;
    } else {
      r = await post(msg, id);
    }
    if (!r) {
      throw new RemoteMcpError("remote-protocol-error", `no answer to ${method}`);
    }
    if (r.error) {
      throw new RemoteMcpError("remote-protocol-error", `${method}: ${r.error.message}`);
    }
    return r.result;
  };

  const connectSse = async (): Promise<void> => {
    const res = await send(
      server,
      {
        method: "GET",
        headers: {
          ...callerHeaders(),
          accept: "text/event-stream",
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        },
      },
      opts.connect,
      timeoutMs,
    );
    refuseRedirect(res, "the SSE stream");
    if (res.status !== 200) {
      res.body.resume();
      throw new RemoteMcpError("remote-http-error", `SSE stream: HTTP ${res.status}`);
    }
    sseStream = res.body;
    await new Promise<void>((resolve, reject) => {
      let announced = false;
      readSse(res.body, (e) => {
        if (!announced) {
          if (e.event !== "endpoint") {
            return false;
          }
          announced = true;
          let u: URL;
          try {
            u = new URL(e.data.trim(), server);
          } catch {
            reject(
              new RemoteMcpError(
                "sse-endpoint-cross-origin",
                "the announced endpoint is not a URL",
              ),
            );
            return true;
          }
          if (u.origin !== server.origin) {
            reject(
              new RemoteMcpError(
                "sse-endpoint-cross-origin",
                `the announced endpoint ${u.origin} is not the server's origin ${server.origin}`,
              ),
            );
            return true;
          }
          ssePost = u;
          resolve();
          return false;
        }
        try {
          const msg = JSON.parse(e.data) as JsonRpcResponse;
          ssePending.get(msg.id)?.(msg);
          ssePending.delete(msg.id);
        } catch {
          /* not an answer */
        }
        return false;
      }).then(() => {
        if (!announced) {
          reject(
            new RemoteMcpError(
              "remote-protocol-error",
              "the SSE stream ended before announcing an endpoint",
            ),
          );
        }
      }, reject);
    });
  };

  return {
    server: server.href,
    /** Open the session (initialize + initialized). */
    async initialize(): Promise<unknown> {
      if (opts.transport === "sse") {
        await connectSse();
      }
      const result = (await request("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: opts.clientInfo ?? { name: "enclawed", version: "1" },
      })) as { protocolVersion?: string } | null;
      if (result && typeof result.protocolVersion === "string") {
        protocolVersion = result.protocolVersion;
      }
      await post({ jsonrpc: "2.0", method: "notifications/initialized" }, null);
      return result;
    },
    request,
    listTools: () => request("tools/list", {}),
    callTool: (name: string, args: unknown) => request("tools/call", { name, arguments: args }),
    discoverAuthorization: () => discoverAuthorization(),
    /**
     * The URL to show the user for authorization (never opened or run here),
     * with PKCE S256. Keep `verifier` for exchangeCode.
     */
    authorizationUrl(
      endpoints: AuthorizationEndpoints,
      p: { clientId: string; redirectUri: string; scope?: string },
    ): { url: string; verifier: string; state: string } {
      const ep = checkOAuthEndpoint(
        server,
        "authorization_endpoint",
        endpoints.authorizationEndpoint,
        extra,
      );
      const verifier = b64url(randomBytes(32));
      const state = b64url(randomBytes(16));
      ep.searchParams.set("response_type", "code");
      ep.searchParams.set("client_id", p.clientId);
      ep.searchParams.set("redirect_uri", p.redirectUri);
      ep.searchParams.set("code_challenge", b64url(createHash("sha256").update(verifier).digest()));
      ep.searchParams.set("code_challenge_method", "S256");
      ep.searchParams.set("state", state);
      ep.searchParams.set("resource", server.href);
      if (p.scope) {
        ep.searchParams.set("scope", p.scope);
      }
      return { url: ep.href, verifier, state };
    },
    /** Exchange an authorization code at the (checked) token endpoint; keeps the access token for this server. */
    async exchangeCode(
      endpoints: AuthorizationEndpoints,
      p: { clientId: string; redirectUri: string; code: string; verifier: string },
    ): Promise<void> {
      const ep = checkOAuthEndpoint(server, "token_endpoint", endpoints.tokenEndpoint, extra);
      const form = new URLSearchParams({
        grant_type: "authorization_code",
        code: p.code,
        redirect_uri: p.redirectUri,
        client_id: p.clientId,
        code_verifier: p.verifier,
        resource: server.href,
      });
      const res = await send(
        ep,
        {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            accept: "application/json",
          },
          body: form.toString(),
        },
        opts.connect,
        timeoutMs,
      );
      refuseRedirect(res, "the token endpoint");
      const text = await readAll(res.body);
      if (res.status !== 200) {
        throw new RemoteMcpError("remote-http-error", `token endpoint: HTTP ${res.status}`);
      }
      let tok: unknown;
      try {
        tok = JSON.parse(text) as unknown;
      } catch {
        throw new RemoteMcpError("oauth-metadata-invalid", "the token response is not JSON");
      }
      const t = (tok as { access_token?: unknown; token_type?: unknown }) ?? {};
      if (typeof t.access_token !== "string" || !/^[\x21-\x7e]{1,8192}$/.test(t.access_token)) {
        throw new RemoteMcpError(
          "oauth-metadata-invalid",
          "the token response has no usable access_token",
        );
      }
      accessToken = t.access_token;
    },
    close(): void {
      sseStream?.destroy();
      sseStream = null;
    },
  };
}

export type RemoteMcpClient = ReturnType<typeof createRemoteMcpClient>;
