// No free-form egress (./request-shape-profiles.ts, ./relay.ts), on the wire:
// a declared destination without an API profile takes the generic profile.
// What a fetch sends passes (with its user-agent replaced and its
// free-text headers dropped); every attempt to carry data out through a
// body, a query, a header, a long or deep path, an encoding or a stream is
// refused with a 403 and never reaches the upstream; the path choice that
// remains is charged against the destination's capacity ledger, and a
// request over budget is refused. An explicit API profile takes exactly its
// routes and body schema. Loopback stand-ins only; no namespaces needed.

import http from "node:http";
import net from "node:net";
import tls from "node:tls";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ResolvedDestination } from "./plan.js";
import {
  GENERIC_LEDGER_BURST_BITS,
  createEgressRelay,
  type EgressRelay,
  type RelayEvent,
} from "./relay.js";
import { GENERIC_USER_AGENT } from "./request-shape-profiles.js";
import { resolveRequestShape, type RequestShapeDeclaration } from "./request-shape.js";
import { startStandIns } from "./test-helpers.js";
import { createContainerCa, type ContainerCa } from "./x509.js";

const DOCS = "docs.example";
const BARE = "bare.example";
const API = "api.example";

function dest(host: string, shape: RequestShapeDeclaration | null): ResolvedDestination {
  const r = shape === null ? { ok: true as const, shape: null } : resolveRequestShape(shape);
  if (!r.ok) {
    throw new Error(r.message);
  }
  return {
    host,
    port: 443,
    mode: "inspect",
    background: true,
    profiles: [],
    constants: [],
    shape: r.shape,
  };
}

let stand: Awaited<ReturnType<typeof startStandIns>>;
let relay: EgressRelay;
let ca: ContainerCa;
let server: net.Server;
let relayPort: number;
let clock = 0;
const events: RelayEvent[] = [];

async function connect(name: string): Promise<tls.TLSSocket> {
  const sock = net.connect(relayPort, "127.0.0.1");
  await new Promise<void>((r, j) => {
    sock.once("connect", () => r());
    sock.once("error", j);
  });
  sock.write(`${JSON.stringify({ name, port: 443 })}\n`);
  await new Promise<void>((r) => sock.once("data", () => r()));
  const t = tls.connect({
    socket: sock,
    servername: name,
    ca: ca.certPem,
    ALPNProtocols: ["http/1.1"],
  });
  await new Promise<void>((r, j) => {
    t.once("secureConnect", () => r());
    t.once("error", j);
  });
  return t;
}

async function send(
  name: string,
  target: string,
  o: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<{ status: number; refused: string | null; body: string }> {
  const t = await connect(name);
  return new Promise((resolve, reject) => {
    const r = http.request(
      {
        createConnection: () => t,
        method: o.method ?? "GET",
        path: target,
        headers: { host: name, connection: "close", ...o.headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            refused: (res.headers["x-enclawed-refused"] as string | undefined) ?? null,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    r.on("error", reject);
    r.end(o.body);
  });
}

beforeAll(async () => {
  const echo = () => ({ status: 200, body: "ok" });
  stand = await startStandIns({ [DOCS]: echo, [BARE]: echo, [API]: echo });
  ca = createContainerCa("relay-generic", [DOCS, BARE, API]);
  relay = createEgressRelay({
    label: "relay-generic",
    destinations: [
      dest(DOCS, { profile: "generic", pathPrefix: "/v2" }),
      // A destination handed to the relay with no shape at all: the generic profile.
      dest(BARE, null),
      dest(API, {
        profile: "api",
        routes: [
          { method: "GET", path: "/v1/items/{}", query: ["page"] },
          {
            method: "POST",
            path: "/v1/items",
            body: {
              maxBytes: 256,
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", maxLength: 32 },
                  kind: { type: "string", maxLength: 8, enum: ["a", "b"] },
                },
                required: ["name"],
              },
            },
          },
        ],
        headers: ["x-api-version"],
      }),
    ],
    ca,
    secrets: [],
    secretValues: new Map(),
    handles: new Map(),
    upstream: stand.upstream,
    onEvent: (e) => events.push(e),
    ledgerClock: () => clock,
  });
  server = net.createServer((s) => relay.handle(s));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  relayPort = (server.address() as net.AddressInfo).port;
});

afterAll(async () => {
  relay.close();
  await new Promise<void>((r) => server.close(() => r()));
  await stand.close();
});

describe("generic profile: a declared destination is for fetching", () => {
  it("a fetch below the prefix passes; the user-agent is replaced and free-text headers never leave", async () => {
    const before = stand.requests.length;
    const r = await send(DOCS, "/v2/guide/install.html", {
      headers: {
        "user-agent": "curl/8.5.0 secret-goes-here",
        accept: "text/html",
        "accept-language": "en-US,en;q=0.9,exfil=AAAA",
        "accept-encoding": "gzip, deflate, br",
        "if-none-match": '"payload"',
      },
    });
    expect(r.status).toBe(200);
    expect((await send(BARE, "/")).status).toBe(200);
    expect((await send(BARE, "/index.html", { method: "HEAD" })).status).toBe(200);
    const up = stand.requests[before];
    expect(up.path).toBe("/v2/guide/install.html");
    expect(up.headers["user-agent"]).toBe(GENERIC_USER_AGENT);
    expect(up.headers["accept-language"]).toBeUndefined();
    expect(up.headers["if-none-match"]).toBeUndefined();
    expect(up.headers["accept-encoding"]).toBe("br, deflate, gzip");
    expect(up.headers.accept).toBe("text/html");
    // An accept value that could carry data is forwarded as */*.
    await send(DOCS, "/v2/a", { headers: { accept: "text/x-AAAABBBBCCCC" } });
    expect(stand.requests.at(-1)!.headers.accept).toBe("*/*");
  });

  it("exfiltration through a body, a query, headers, long or deep paths, encodings and streams is refused before the upstream", async () => {
    const before = stand.requests.length;
    const secret = "c2VjcmV0LWRhdGEtZnJvbS10aGUtcHJvamVjdA";
    const attempts: Array<[string, string, Parameters<typeof send>[2], string]> = [
      [
        DOCS,
        "/v2/upload",
        { method: "POST", body: secret, headers: { "content-type": "text/plain" } },
        "request-shape-method",
      ],
      [DOCS, "/v2/upload", { method: "PUT", body: secret }, "request-shape-method"],
      [
        BARE,
        "/",
        { method: "GET", body: secret, headers: { "content-length": String(secret.length) } },
        "request-shape-body",
      ],
      [DOCS, `/v2/search?q=${secret}`, {}, "request-shape-query"],
      [BARE, `/?${secret}`, {}, "request-shape-query"],
      [DOCS, "/v2/a", { headers: { "x-data": secret } }, "request-shape-header"],
      [DOCS, "/v2/a", { headers: { authorization: `Bearer ${secret}` } }, "request-shape-header"],
      [DOCS, "/v2/a", { headers: { cookie: `s=${secret}` } }, "request-shape-header"],
      [DOCS, "/v2/a", { headers: { "content-type": "application/json" } }, "request-shape-header"],
      [DOCS, `/v2/${"a".repeat(49)}`, {}, "request-shape-path"],
      [DOCS, `/v2/${Array.from({ length: 7 }, () => "ab").join("/")}`, {}, "request-shape-path"],
      [DOCS, `/v2/${"abcdefghijklmnopqrstuvwxyz0123/".repeat(4)}`, {}, "request-shape-path"],
      [DOCS, "/v2/a%20b", {}, "request-shape-path"],
      [DOCS, "/v2/a;b=c", {}, "request-shape-path"],
      [DOCS, "/v2/../admin", {}, "request-shape-path"],
      [DOCS, "/other/path", {}, "request-shape-path"],
      [
        DOCS,
        "/v2/ws",
        {
          headers: {
            upgrade: "websocket",
            connection: "Upgrade",
            "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
            "sec-websocket-version": "13",
          },
        },
        "request-shape-stream",
      ],
    ];
    for (const [host, target, o, code] of attempts) {
      const r = await send(host, target, o);
      expect([target, r.status, r.refused]).toEqual([target, 403, code]);
    }
    expect(stand.requests.length).toBe(before);
  });

  it("the path choice is charged against the destination's ledger: a request over budget is refused, and the budget refills with time", async () => {
    clock = 1_000_000;
    // Each request names a 40-character path: ~250 bits of choice.
    const seg = (i: number) => `/v2/${String(i).padStart(36, "x")}`;
    let refusedAt = -1;
    for (let i = 0; i < 200; i++) {
      const r = await send(DOCS, seg(i));
      if (r.status === 403) {
        expect(r.refused).toBe("request-shape-capacity");
        refusedAt = i;
        break;
      }
    }
    // The burst holds GENERIC_LEDGER_BURST_BITS: about 16384 / 250 = 65 such requests.
    expect(refusedAt).toBeGreaterThan(40);
    expect(refusedAt).toBeLessThan(80);
    const before = stand.requests.length;
    expect((await send(DOCS, seg(999))).refused).toBe("request-shape-capacity");
    expect(stand.requests.length).toBe(before);
    // Another destination has its own ledger.
    expect((await send(BARE, "/x")).status).toBe(200);
    // Refilled after enough time.
    clock += Math.ceil((GENERIC_LEDGER_BURST_BITS / 64) * 1000);
    expect((await send(DOCS, seg(1000))).status).toBe(200);
  });
});

describe("explicit api profile: exactly the declared routes and body schema", () => {
  it("a declared route passes; another route, method, query name, header or a body outside its schema is refused", async () => {
    expect((await send(API, "/v1/items/abc-1?page=2")).status).toBe(200);
    const ok = await send(API, "/v1/items", {
      method: "POST",
      body: JSON.stringify({ name: "widget", kind: "a" }),
      headers: { "content-type": "application/json", "x-api-version": "3" },
    });
    expect(ok.status).toBe(200);
    expect(stand.requests.at(-1)!.body).toBe('{"name":"widget","kind":"a"}');
    const before = stand.requests.length;
    for (const [target, o, code] of [
      ["/v1/other", {}, "request-shape-path"],
      ["/v1/items/abc", { method: "DELETE" }, "request-shape-method"],
      ["/v1/items/abc?dump=all", {}, "request-shape-query"],
      ["/v1/items/abc", { headers: { "x-exfil": "1" } }, "request-shape-header"],
      [
        "/v1/items",
        {
          method: "POST",
          body: JSON.stringify({ name: "w", extra: "secret" }),
          headers: { "content-type": "application/json" },
        },
        "request-shape-body",
      ],
      [
        "/v1/items",
        {
          method: "POST",
          body: JSON.stringify({ name: "x".repeat(33) }),
          headers: { "content-type": "application/json" },
        },
        "request-shape-body",
      ],
      [
        "/v1/items",
        { method: "POST", body: "name=w", headers: { "content-type": "text/plain" } },
        "request-shape-body",
      ],
      [
        "/v1/items",
        {
          method: "POST",
          body: JSON.stringify({ name: "w", kind: "c" }),
          headers: { "content-type": "application/json" },
        },
        "request-shape-body",
      ],
    ] as const) {
      const r = await send(API, target, o as Parameters<typeof send>[2]);
      expect([target, r.status, r.refused]).toEqual([target, 403, code]);
    }
    expect(stand.requests.length).toBe(before);
  });
});
