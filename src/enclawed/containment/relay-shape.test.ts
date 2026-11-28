// The relay with shaped registry destinations, on the wire (./request-shape.ts,
// ./relay.ts, ./relay-h2.ts): an agent whose only network is a package
// registry (or an Artifactory-style proxy of one) cannot send it an
// exploit-shaped request. Each refused request gets a 403 and an event with
// its rule's code and never reaches the upstream; installer requests pass;
// a pinned tarball is verified before a byte of it reaches the process, and a
// tampered one is refused. Loopback stand-ins only; no namespaces needed.

import { createHash } from "node:crypto";
import http from "node:http";
import http2 from "node:http2";
import net from "node:net";
import tls from "node:tls";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ResolvedDestination } from "./plan.js";
import { createEgressRelay, type EgressRelay, type RelayEvent } from "./relay.js";
import { resolveRequestShape, type RequestShapeDeclaration } from "./request-shape.js";
import { startStandIns } from "./test-helpers.js";
import { createContainerCa, type ContainerCa } from "./x509.js";

const NPM = "registry.npmjs.org";
const ART = "artifacts.example";
const PREFIX = "/artifactory/api/npm/npm-remote";
const TGZ = "left-pad-1.3.0 tarball: the real bytes";
const TAMPERED = "left-pad-1.3.0 tarball: a backdoored copy";
const SRI = `sha512-${createHash("sha512").update(TGZ).digest("base64")}`;
const TGZ_PATH = "/left-pad/-/left-pad-1.3.0.tgz";

function dest(host: string, shape: RequestShapeDeclaration): ResolvedDestination {
  const r = resolveRequestShape(shape);
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
const events: RelayEvent[] = [];

/** A TLS connection through the relay to `name`, as a contained process makes one. */
async function connect(name: string, alpn: string[] = ["http/1.1"]): Promise<tls.TLSSocket> {
  const sock = net.connect(relayPort, "127.0.0.1");
  await new Promise<void>((r, j) => {
    sock.once("connect", () => r());
    sock.once("error", j);
  });
  sock.write(`${JSON.stringify({ name, port: 443 })}\n`);
  await new Promise<void>((r) => sock.once("data", () => r()));
  const t = tls.connect({ socket: sock, servername: name, ca: ca.certPem, ALPNProtocols: alpn });
  await new Promise<void>((r, j) => {
    t.once("secureConnect", () => r());
    t.once("error", j);
  });
  return t;
}

/** Send raw HTTP/1.1 bytes; the status code and body of the answer (connection closed after). */
async function raw(name: string, text: string): Promise<{ status: number; body: string }> {
  const t = await connect(name);
  const chunks: Buffer[] = [];
  t.on("data", (c: Buffer) => chunks.push(c));
  t.write(text);
  await new Promise<void>((r) => {
    t.on("end", () => r());
    t.on("close", () => r());
    setTimeout(() => {
      t.destroy();
      r();
    }, 4000).unref();
  });
  const all = Buffer.concat(chunks).toString("latin1");
  const status = Number(/^HTTP\/1\.1 (\d{3})/.exec(all)?.[1] ?? 0);
  return { status, body: all.slice(all.indexOf("\r\n\r\n") + 4) };
}

/** A well-formed HTTP/1.1 request through the relay (Node's client). */
async function get(
  name: string,
  target: string,
  headers: Record<string, string> = {},
  method = "GET",
): Promise<{ status: number; body: Buffer; headers: http.IncomingHttpHeaders }> {
  const t = await connect(name);
  return new Promise((resolve, reject) => {
    const r = http.request(
      {
        createConnection: () => t,
        method,
        path: target,
        headers: { host: name, connection: "close", ...headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks),
            headers: res.headers,
          }),
        );
      },
    );
    r.on("error", reject);
    r.end();
  });
}

const refusedCodes = () =>
  events.filter((e) => e.type === "egress-refused").map((e) => (e as { code: string }).code);

beforeAll(async () => {
  stand = await startStandIns({
    [NPM]: (r) =>
      r.path === TGZ_PATH
        ? { status: 200, body: TGZ, headers: { "content-type": "application/octet-stream" } }
        : { status: 200, body: JSON.stringify({ name: "left-pad", path: r.path }) },
    [ART]: (r) =>
      r.path === `${PREFIX}${TGZ_PATH}`
        ? { status: 200, body: TAMPERED, headers: { "content-type": "application/octet-stream" } }
        : { status: 200, body: JSON.stringify({ proxied: r.path }) },
  });
  ca = createContainerCa("relay-shape", [NPM, ART]);
  relay = createEgressRelay({
    label: "relay-shape",
    destinations: [
      dest(NPM, { profile: "npm-registry", pins: { [TGZ_PATH]: SRI } }),
      dest(ART, { profile: "npm-registry", pathPrefix: PREFIX, pins: { [TGZ_PATH]: SRI } }),
    ],
    ca,
    secrets: [],
    secretValues: new Map(),
    handles: new Map(),
    upstream: stand.upstream,
    onEvent: (e) => events.push(e),
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

describe("relay: shaped registry destinations refuse exploit-shaped requests", () => {
  it("installer metadata requests pass, scoped and plain, and reach the registry", async () => {
    const before = stand.requests.length;
    const a = await get(NPM, "/left-pad", {
      "user-agent": "npm/10.8.2 node/v22.11.0 linux x64",
      accept: "application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*",
      "npm-command": "install",
    });
    expect(a.status).toBe(200);
    const b = await get(NPM, "/@types%2fnode");
    expect(b.status).toBe(200);
    expect(JSON.parse(b.body.toString()).path).toBe("/@types%2fnode");
    expect((await get(NPM, "/left-pad", {}, "HEAD")).status).toBe(200);
    expect(stand.requests.length - before).toBe(3);
  });

  it("a pinned tarball is verified and handed over whole; range and conditional headers never reach the registry", async () => {
    const r = await get(NPM, TGZ_PATH, {
      range: "bytes=0-3",
      "if-none-match": '"old"',
      "accept-encoding": "gzip",
    });
    expect(r.status).toBe(200);
    expect(r.body.toString()).toBe(TGZ);
    const up = stand.requests.at(-1)!;
    expect(up.path).toBe(TGZ_PATH);
    expect(up.headers.range).toBeUndefined();
    expect(up.headers["if-none-match"]).toBeUndefined();
    expect(up.headers["accept-encoding"]).toBeUndefined();
  });

  it("a tampered tarball (pin mismatch) is refused and none of its bytes reach the process", async () => {
    const r = await get(ART, `${PREFIX}${TGZ_PATH}`);
    expect(r.status).toBe(403);
    expect(r.headers["x-enclawed-refused"]).toBe("artifact-pin-mismatch");
    expect(r.body.toString()).not.toContain("backdoored");
    expect(refusedCodes()).toContain("artifact-pin-mismatch");
  });

  it("the Artifactory-exploit shapes: methods, traversal, encodings, odd endpoints, bodies, headers, size", async () => {
    const before = stand.requests.length;
    const cases: Array<[string, string, string]> = [
      [
        NPM,
        "POST /left-pad HTTP/1.1\r\nHost: registry.npmjs.org\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}",
        "request-shape-method",
      ],
      [
        NPM,
        "PUT /left-pad HTTP/1.1\r\nHost: registry.npmjs.org\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        "request-shape-method",
      ],
      [
        NPM,
        "DELETE /left-pad/-rev/1-x HTTP/1.1\r\nHost: registry.npmjs.org\r\nConnection: close\r\n\r\n",
        "request-shape-method",
      ],
      [
        NPM,
        "GET /../../etc/passwd HTTP/1.1\r\nHost: registry.npmjs.org\r\nConnection: close\r\n\r\n",
        "request-shape-path",
      ],
      [
        NPM,
        "GET /left-pad/..%2f..%2fadmin HTTP/1.1\r\nHost: registry.npmjs.org\r\nConnection: close\r\n\r\n",
        "request-shape-path",
      ],
      [
        NPM,
        "GET /%2e%2e/%2e%2e/api/system HTTP/1.1\r\nHost: registry.npmjs.org\r\nConnection: close\r\n\r\n",
        "request-shape-path",
      ],
      [
        NPM,
        "GET /left-pad/..;/..;/admin HTTP/1.1\r\nHost: registry.npmjs.org\r\nConnection: close\r\n\r\n",
        "request-shape-path",
      ],
      [
        NPM,
        "GET /-/whoami HTTP/1.1\r\nHost: registry.npmjs.org\r\nConnection: close\r\n\r\n",
        "request-shape-path",
      ],
      [
        NPM,
        "GET /-/v1/search?text=x HTTP/1.1\r\nHost: registry.npmjs.org\r\nConnection: close\r\n\r\n",
        "request-shape-query",
      ],
      [
        ART,
        "GET /artifactory/api/system/ping HTTP/1.1\r\nHost: artifacts.example\r\nConnection: close\r\n\r\n",
        "request-shape-path",
      ],
      [
        ART,
        "GET /artifactory/api/repositories HTTP/1.1\r\nHost: artifacts.example\r\nConnection: close\r\n\r\n",
        "request-shape-path",
      ],
      [
        ART,
        `GET ${PREFIX}/../../system/ping HTTP/1.1\r\nHost: artifacts.example\r\nConnection: close\r\n\r\n`,
        "request-shape-path",
      ],
      [
        ART,
        `GET ${PREFIX}/-/user/org.couchdb.user:x HTTP/1.1\r\nHost: artifacts.example\r\nConnection: close\r\n\r\n`,
        "request-shape-path",
      ],
      [
        NPM,
        "GET /left-pad HTTP/1.1\r\nHost: registry.npmjs.org\r\nContent-Length: 5\r\nConnection: close\r\n\r\nhello",
        "request-shape-body",
      ],
      [
        NPM,
        "GET /left-pad HTTP/1.1\r\nHost: registry.npmjs.org\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n5\r\nhello\r\n0\r\n\r\n",
        "request-shape-body",
      ],
      [
        NPM,
        "GET /left-pad HTTP/1.1\r\nHost: registry.npmjs.org\r\nX-Forwarded-For: 127.0.0.1\r\nConnection: close\r\n\r\n",
        "request-shape-header",
      ],
      [
        NPM,
        "GET /left-pad HTTP/1.1\r\nHost: registry.npmjs.org\r\nX-HTTP-Method-Override: PUT\r\nConnection: close\r\n\r\n",
        "request-shape-header",
      ],
      [
        NPM,
        "GET /left-pad HTTP/1.1\r\nHost: registry.npmjs.org\r\nX-Original-URL: /artifactory/api/system\r\nConnection: close\r\n\r\n",
        "request-shape-header",
      ],
      [
        NPM,
        "GET /left-pad HTTP/1.1\r\nHost: registry.npmjs.org\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n",
        "request-shape-header",
      ],
      [
        NPM,
        `GET /${"a".repeat(1100)} HTTP/1.1\r\nHost: registry.npmjs.org\r\nConnection: close\r\n\r\n`,
        "request-shape-path",
      ],
    ];
    for (const [host, text, code] of cases) {
      const n = events.length;
      const r = await raw(host, text);
      const first = text.slice(0, text.indexOf("\r\n"));
      expect(r.status, first).toBe(403);
      expect(
        events.slice(n).map((e) => (e as { code?: string }).code),
        first,
      ).toContain(code);
    }
    expect(stand.requests.length - before).toBe(0);
  });

  it("HTTP/2: a pinned tarball is verified, a tampered one and a publish are refused", async () => {
    const t = await connect(NPM, ["h2"]);
    expect(t.alpnProtocol).toBe("h2");
    const session = http2.connect(`https://${NPM}`, { createConnection: () => t });
    const ask = (headers: http2.OutgoingHttpHeaders, body?: string) =>
      new Promise<{ status: number; body: string; refused?: string }>((resolve, reject) => {
        const s = session.request(headers, { endStream: body === undefined });
        let status = 0;
        let refused: string | undefined;
        const chunks: Buffer[] = [];
        s.on("response", (h) => {
          status = Number(h[":status"]);
          refused = h["x-enclawed-refused"] as string | undefined;
        });
        s.on("data", (c: Buffer) => chunks.push(c));
        s.on("end", () => resolve({ status, body: Buffer.concat(chunks).toString(), refused }));
        s.on("error", reject);
        if (body !== undefined) {
          s.end(body);
        }
      });
    try {
      const ok = await ask({ ":method": "GET", ":path": TGZ_PATH, ":authority": NPM });
      expect(ok).toMatchObject({ status: 200, body: TGZ });
      const pub = await ask(
        {
          ":method": "PUT",
          ":path": "/left-pad",
          ":authority": NPM,
          "content-type": "application/json",
        },
        "{}",
      );
      expect(pub).toMatchObject({ status: 403, refused: "request-shape-method" });
    } finally {
      session.destroy();
    }
    // A tampered tarball over h2 is refused the same way.
    const t2 = await connect(ART, ["h2"]);
    const s2 = http2.connect(`https://${ART}`, { createConnection: () => t2 });
    try {
      const bad = await new Promise<{ status: number; body: string; refused?: string }>(
        (resolve, reject) => {
          const st = s2.request({
            ":method": "GET",
            ":path": `${PREFIX}${TGZ_PATH}`,
            ":authority": ART,
          });
          let status = 0;
          let refused: string | undefined;
          const chunks: Buffer[] = [];
          st.on("response", (h) => {
            status = Number(h[":status"]);
            refused = h["x-enclawed-refused"] as string | undefined;
          });
          st.on("data", (c: Buffer) => chunks.push(c));
          st.on("end", () => resolve({ status, body: Buffer.concat(chunks).toString(), refused }));
          st.on("error", reject);
        },
      );
      expect(bad).toMatchObject({ status: 403, refused: "artifact-pin-mismatch" });
      expect(bad.body).not.toContain("backdoored");
    } finally {
      s2.destroy();
    }
  });
});
