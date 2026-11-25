// The auth-injecting relay (./auth-relay.ts), live against a local https
// stand-in for the provider and for its token endpoint. Attack side: a route
// not listed, a request without the placeholder, a credential the host sent,
// a plain (non-TLS) request for a credential route, another TLS name, an
// upstream whose certificate is not trusted (the token is never sent), a
// socket directory others can enter. False-positive side: a listed request
// gets the real token and nothing else, streams back, a 401 or a near expiry
// renews the token once and the rotation is handed over to be sealed, close
// drops the token.

import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tempTree } from "../containment/test-helpers.js";
import { createContainerCa } from "../containment/x509.js";
import {
  auditedAuthRelayEvents,
  AUTH_RELAY_REFRESH_RECORD,
  oauthRelayCredential,
  processMemoryShielded,
  startAuthRelay,
  type AuthRelay,
  type OAuthLogin,
} from "./auth-relay.js";

const HOST = "api.provider.test";
const TOKEN_HOST = "auth.provider.test";
const PLACEHOLDER = "placeholder-not-a-secret";
const REAL = "real-access-token-SECRET-1";
const REFRESH = "real-refresh-token-SECRET-1";

type Seen = { method: string; url: string; headers: http.IncomingHttpHeaders; body: string };

let root: string;
let upstream: https.Server;
let tokenEp: https.Server;
let upstreamPort = 0;
let tokenPort = 0;
const seen: Seen[] = [];
const tokenCalls: Record<string, unknown>[] = [];
/** The token the stand-in provider accepts now. */
let accepted = REAL;
const upstreamCa = createContainerCa("stand-in provider", [HOST, TOKEN_HOST]);

const listen = (s: https.Server) =>
  new Promise<number>((r) => s.listen(0, "127.0.0.1", () => r((s.address() as AddressInfo).port)));

beforeAll(async () => {
  root = tempTree("enclawed-auth-relay");
  const leaf = upstreamCa.leafFor(HOST);
  upstream = https.createServer({ key: leaf.keyPem, cert: leaf.certPem }, (req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      seen.push({ method: req.method ?? "", url: req.url ?? "", headers: req.headers, body });
      if (req.headers.authorization !== `Bearer ${accepted}`) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end("{}");
        return;
      }
      res.writeHead(200, { "content-type": "text/event-stream", "set-cookie": "s=1" });
      res.write("event: a\ndata: 1\n\n");
      res.end("event: b\ndata: 2\n\n");
    });
  });
  upstreamPort = await listen(upstream);
  const tleaf = upstreamCa.leafFor(TOKEN_HOST);
  tokenEp = https.createServer({ key: tleaf.keyPem, cert: tleaf.certPem }, (req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const j = JSON.parse(body) as Record<string, unknown>;
      tokenCalls.push(j);
      if (j.grant_type !== "refresh_token" || j.client_id !== "client-1") {
        res.writeHead(400);
        res.end("{}");
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          access_token: accepted,
          refresh_token: `${String(j.refresh_token)}-next`,
          expires_in: 3600,
        }),
      );
    });
  });
  tokenPort = await listen(tokenEp);
});
afterAll(async () => {
  await new Promise((r) => upstream.close(r));
  await new Promise((r) => tokenEp.close(r));
  fs.rmSync(root, { recursive: true, force: true });
});

let n = 0;
async function relay(
  login: Partial<OAuthLogin> = {},
  opts: {
    trust?: boolean;
    now?: () => number;
    onEvent?: (
      e: Parameters<NonNullable<Parameters<typeof startAuthRelay>[0]["onEvent"]>>[0],
    ) => void;
  } = {},
) {
  const dir = path.join(root, `r${++n}`);
  fs.mkdirSync(dir, { mode: 0o700 });
  const rotated: OAuthLogin[] = [];
  const credential = oauthRelayCredential({
    login: {
      accessToken: REAL,
      refreshToken: REFRESH,
      expiresAt: Date.now() + 3600_000,
      scopes: ["user:inference"],
      ...login,
    },
    tokenUrl: `https://${TOKEN_HOST}/v1/oauth/token`,
    clientId: "client-1",
    onRotate: (l) => rotated.push(l),
    trustForTest: upstreamCa.certPem,
    addressForTest: { host: "127.0.0.1", port: tokenPort },
    ...(opts.now ? { now: opts.now } : {}),
  });
  const events: string[] = [];
  const r = await startAuthRelay({
    socketPath: path.join(dir, "a.sock"),
    upstreamHost: HOST,
    placeholder: { header: "authorization", value: `Bearer ${PLACEHOLDER}` },
    credentialHeader: { header: "authorization", prefix: "Bearer " },
    routes: [
      { method: "POST", path: /^\/v1\/messages$/, credential: true },
      { method: "GET", path: /^\/api\/limits$/, credential: false },
      { method: "GET", path: /^\/v1\/models\/.+$/, credential: true },
    ],
    credential,
    ...(opts.trust === false ? {} : { upstreamTrustForTest: upstreamCa.certPem }),
    upstreamAddressForTest: { host: "127.0.0.1", port: upstreamPort },
    onEvent: (e) => {
      events.push(`${e.kind}:${e.status}`);
      opts.onEvent?.(e);
    },
  });
  return { r, rotated, events, credential };
}

/** The host's side: TLS over the unix socket, trusting only the relay's session CA. */
function call(
  r: AuthRelay,
  o: {
    method?: string;
    path?: string;
    headers?: Record<string, string>;
    tls?: boolean;
    servername?: string;
    body?: string;
  } = {},
) {
  return new Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }>(
    (resolve, reject) => {
      const mod = o.tls === false ? http : https;
      const req = mod.request(
        {
          socketPath: r.socketPath,
          method: o.method ?? "POST",
          path: o.path ?? "/v1/messages",
          headers: {
            authorization: `Bearer ${PLACEHOLDER}`,
            "content-type": "application/json",
            ...o.headers,
          },
          ...(o.tls === false
            ? {}
            : {
                servername: o.servername ?? HOST,
                ca: r.caCertPem,
                rejectUnauthorized: o.servername === undefined,
                host: o.servername ?? HOST,
              }),
          agent: false,
        } as https.RequestOptions,
        (res) => {
          let body = "";
          res.on("data", (d) => (body += d));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
        },
      );
      req.on("error", reject);
      req.end((o.method ?? "POST") === "GET" ? undefined : (o.body ?? '{"x":1}'));
    },
  );
}

describe("auth relay", () => {
  it("false positive: a listed request gets the real token, pinned host, nothing the host sent as a credential", async () => {
    const { r, events } = await relay();
    seen.length = 0;
    const res = await call(r, { headers: { "x-api-key": "host-key", cookie: "c=1" } });
    expect(res.status).toBe(200);
    expect(res.body).toBe("event: a\ndata: 1\n\nevent: b\ndata: 2\n\n");
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(seen).toHaveLength(1);
    expect(seen[0].headers.authorization).toBe(`Bearer ${REAL}`);
    expect(seen[0].headers["x-api-key"]).toBeUndefined();
    expect(seen[0].headers.cookie).toBeUndefined();
    expect(seen[0].headers.host).toBe(HOST);
    expect(seen[0].body).toBe('{"x":1}');
    expect(JSON.stringify(seen[0].headers)).not.toContain(PLACEHOLDER);
    // The host only ever holds the CA certificate, never a token.
    expect(r.caCertPem).not.toContain(REAL);
    expect(fs.statSync(r.socketPath).mode & 0o777).toBe(0o600);
    expect(events).toContain("forwarded:200");
    // A route without a credential goes plain, with none.
    seen.length = 0;
    const plain = await call(r, {
      method: "GET",
      path: "/api/limits",
      tls: false,
      headers: { authorization: "" },
    });
    expect([plain.status, plain.body]).toEqual([401, "{}"]);
    expect(seen[0].headers.authorization).toBeUndefined();
    await r.close();
  });

  it("attack: unlisted routes, a missing placeholder, a plain request for a credential route and another TLS name are refused, never forwarded", async () => {
    const { r } = await relay();
    seen.length = 0;
    expect((await call(r, { path: "/v1/other" })).status).toBe(403);
    expect((await call(r, { path: "/v1/messages/../admin" })).status).toBe(403);
    // A pattern that admits a sub-path never admits a dot-dot or an encoded one.
    expect((await call(r, { method: "GET", path: "/v1/models/../../admin" })).status).toBe(403);
    expect((await call(r, { method: "GET", path: "/v1/models/%2e%2e/admin" })).status).toBe(403);
    expect((await call(r, { method: "GET" })).status).toBe(403);
    expect((await call(r, { headers: { authorization: "Bearer something-else" } })).status).toBe(
      401,
    );
    expect((await call(r, { tls: false })).status).toBe(403);
    expect((await call(r, { servername: "evil.test" })).status).toBe(421);
    expect(seen.map((x) => `${x.method} ${x.url}`)).toEqual([]);
    await r.close();
  });

  it("attack: an upstream whose certificate is not trusted never receives the token", async () => {
    const { r } = await relay({}, { trust: false });
    seen.length = 0;
    expect((await call(r)).status).toBe(502);
    expect(seen).toHaveLength(0);
    await r.close();
  });

  it("refresh: a 401 renews once and the rotation is handed over before use; a near expiry renews first", async () => {
    const { r, rotated } = await relay();
    seen.length = 0;
    tokenCalls.length = 0;
    accepted = "rotated-access-token-2";
    const res = await call(r);
    expect(res.status).toBe(200);
    expect(seen.map((s) => s.headers.authorization)).toEqual([
      `Bearer ${REAL}`,
      "Bearer rotated-access-token-2",
    ]);
    expect(tokenCalls).toEqual([
      {
        grant_type: "refresh_token",
        refresh_token: REFRESH,
        client_id: "client-1",
        scope: "user:inference",
      },
    ]);
    expect(rotated).toHaveLength(1);
    expect(rotated[0]).toMatchObject({
      accessToken: "rotated-access-token-2",
      refreshToken: `${REFRESH}-next`,
    });
    await r.close();
    // Near expiry: renewed before the request, one upstream call.
    const t = await relay({ expiresAt: Date.now() + 1000 });
    seen.length = 0;
    expect((await call(t.r)).status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(t.rotated).toHaveLength(1);
    await t.r.close();
    accepted = REAL;
  });

  it("audit: every refresh and failed refresh is a record of its own in the audit log, carrying no token material", async () => {
    const log: string[] = [];
    const append = async (r: { type: string; payload: Record<string, unknown> }) => {
      log.push(JSON.stringify(r));
    };
    // A 401 renews (rejected), and a near expiry renews before the request (expiry).
    const a = auditedAuthRelayEvents(append);
    const { r, rotated } = await relay({}, { onEvent: a.onEvent });
    accepted = "rotated-access-token-AUDIT-2";
    expect((await call(r)).status).toBe(200);
    await r.close();
    const b = await relay({ expiresAt: Date.now() + 1000 }, { onEvent: a.onEvent });
    expect((await call(b.r)).status).toBe(200);
    await b.r.close();
    // A login with no refresh token cannot renew: near its expiry and on a 401, the failure is recorded.
    const c = await relay(
      { refreshToken: null, expiresAt: Date.now() + 1000 },
      { onEvent: a.onEvent },
    );
    expect((await call(c.r)).status).toBe(401);
    await c.r.close();
    accepted = REAL;
    await a.settled();
    expect(a.failures()).toBe(0);
    const recs = log.map(
      (l) => JSON.parse(l) as { type: string; payload: Record<string, unknown> },
    );
    expect(
      recs.map((x) => `${x.type}:${String(x.payload.reason)}:${String(x.payload.status)}`),
    ).toEqual([
      `${AUTH_RELAY_REFRESH_RECORD.refreshed}:rejected:401`,
      `${AUTH_RELAY_REFRESH_RECORD.refreshed}:expiry:0`,
      `${AUTH_RELAY_REFRESH_RECORD["refresh-failed"]}:expiry:0`,
      `${AUTH_RELAY_REFRESH_RECORD["refresh-failed"]}:rejected:401`,
    ]);
    for (const x of recs) {
      expect(Object.keys(x.payload).toSorted()).toEqual(["method", "path", "reason", "status"]);
      expect(x.payload).toMatchObject({ method: "POST", path: "/v1/messages" });
    }
    // No secret byte reaches the log: no token, refresh token, rotated token or credential header.
    const all = log.join("\n");
    for (const secret of [
      REAL,
      REFRESH,
      `${REFRESH}-next`,
      "rotated-access-token-AUDIT-2",
      ...rotated.flatMap((l) => [l.accessToken, l.refreshToken ?? ""]).filter(Boolean),
      "Bearer",
      PLACEHOLDER,
      "SECRET",
    ]) {
      expect(all).not.toContain(secret);
    }
    // Other events are not records (they may go to the adapter's own observer).
    const other: string[] = [];
    const d = auditedAuthRelayEvents(append, (e) => other.push(e.kind));
    d.onEvent({ kind: "forwarded", method: "POST", path: "/v1/messages", status: 200 });
    await d.settled();
    expect(other).toEqual(["forwarded"]);
    expect(log).toHaveLength(4);
    // An append that throws is counted, never swallowed silently.
    const e = auditedAuthRelayEvents(async () => {
      throw new Error("log is gone");
    });
    e.onEvent({
      kind: "refreshed",
      method: "POST",
      path: "/v1/messages",
      status: 0,
      reason: "expiry",
    });
    await e.settled();
    expect(e.failures()).toBe(1);
  });

  it("close drops the token and the socket; a socket directory others can enter is refused", async () => {
    const { r, credential } = await relay();
    await r.close();
    expect(credential.current()).toBeNull();
    expect(fs.existsSync(r.socketPath)).toBe(false);
    const open = path.join(root, "open");
    fs.mkdirSync(open, { mode: 0o755 });
    fs.chmodSync(open, 0o755);
    await expect(
      startAuthRelay({
        socketPath: path.join(open, "a.sock"),
        upstreamHost: HOST,
        placeholder: { header: "authorization", value: "x" },
        credentialHeader: { header: "authorization", prefix: "Bearer " },
        routes: [],
        credential,
      }),
    ).rejects.toThrow(/not private/);
  });

  it("memory shield: Yama ptrace_scope 1 or more shields; 0 or none does not", () => {
    expect(processMemoryShielded(() => "1\n", "linux").shielded).toBe(true);
    expect(processMemoryShielded(() => "3\n", "linux").shielded).toBe(true);
    expect(processMemoryShielded(() => "0\n", "linux").shielded).toBe(false);
    expect(
      processMemoryShielded(() => {
        throw new Error("ENOENT");
      }, "linux").shielded,
    ).toBe(false);
    expect(processMemoryShielded(() => "1", "darwin").shielded).toBe(false);
  });
});
