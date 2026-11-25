// Live tests of the relay's protocols and call binding: HTTP/2 and
// WebSocket go through the same checks as HTTP/1.1 (legitimate traffic
// works, a credential is refused), every request is bound to exactly one
// in-flight call, and opaque destinations get the checks that need no
// plaintext (TLS server name, cleartext DLP). Real namespaces; local
// stand-ins only.

import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { containmentSupport } from "./host.js";
import type { UpstreamTarget } from "./relay.js";
import {
  FIXTURES,
  POSTMARK_BODY,
  fakeHome,
  planContext,
  refusals,
  startContainedServer,
  startGrpcStandIn,
  startRawStandIn,
  startStandIns,
  startWsStandIn,
  tempTree,
} from "./test-helpers.js";

const live = containmentSupport().ok;

describe.skipIf(!live)("containment relay: protocols, call binding, opaque destinations", () => {
  let root: string;
  let home: string;
  let stateDir: string;
  beforeAll(() => {
    root = tempTree("contain-relay");
    home = fakeHome(root);
    stateDir = path.join(root, "state");
  });
  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("HTTP/2: requests and trailers reach an h2 upstream, an h1-only upstream still answers, and a credential is refused", async () => {
    const stand = await startStandIns({
      "api.h2.test": (r) => ({
        status: 200,
        body: JSON.stringify({ got: r.body, v: r.httpVersion }),
        trailers: { "grpc-status": "0" },
      }),
    });
    const h1 = await startWsStandIn("api.h1only.test");
    const srv = await startContainedServer(
      { name: "ops", command: "node", args: [path.join(FIXTURES, "ops-server.cjs")] },
      {
        roots: [],
        packageRoot: FIXTURES,
        destinations: [
          {
            host: "api.h2.test",
            port: 443,
            mode: "inspect",
            shape: {
              profile: "api",
              routes: [
                {
                  method: "POST",
                  path: "/v1/echo",
                  body: {
                    maxBytes: 4096,
                    schema: {
                      type: "object",
                      properties: { q: { type: "string", maxLength: 256 } },
                    },
                  },
                },
              ],
            },
          },
          { host: "api.h1only.test", port: 443, mode: "inspect" },
        ],
      },
      planContext(home),
      {
        stateDir,
        upstream: (h, p): UpstreamTarget =>
          h === "api.h1only.test" ? h1.target : stand.upstream(h, p),
      },
    );
    try {
      const ok = JSON.parse(
        (
          await srv.call("h2_request", {
            url: "https://api.h2.test/v1/echo",
            method: "POST",
            body: '{"q":"rome"}',
            headers: { "content-type": "application/json" },
          })
        ).text,
      );
      expect(ok).toMatchObject({ status: 200, alpn: "h2", trailers: { "grpc-status": "0" } });
      expect(JSON.parse(ok.body)).toEqual({ got: '{"q":"rome"}', v: "2.0" });
      const fallback = JSON.parse(
        (await srv.call("h2_request", { url: "https://api.h1only.test/x" })).text,
      );
      expect(fallback).toMatchObject({ status: 426, body: "upgrade required" });
      const leak = JSON.parse(
        (
          await srv.call("h2_request", {
            url: "https://api.h2.test/v1/echo",
            method: "POST",
            body: '{"q":"token=ghp_abcdefghijklmnopqrstuvwxyz0123456789"}',
            headers: { "content-type": "application/json" },
          })
        ).text,
      );
      expect(leak.status).toBe(403);
      expect(leak.body).toContain("secret-in-request");
    } finally {
      await srv.close();
      await stand.close();
      await h1.close();
    }
    expect(stand.requests.map((r) => r.body)).toEqual(['{"q":"rome"}']);
    expect(refusals(srv.events).map((r) => r.code)).toEqual(["secret-in-request"]);
  });

  it("WebSocket: messages are checked one by one; the legitimate ones arrive, a credential closes the socket with 1008, a handle is replaced only for its host", async () => {
    const ws = await startWsStandIn("ws.test");
    const srv = await startContainedServer(
      {
        name: "ops",
        command: "node",
        args: [path.join(FIXTURES, "ops-server.cjs")],
        env: { WS_TOKEN: "ws-secret-value-0001" },
      },
      {
        roots: [],
        packageRoot: FIXTURES,
        secrets: [{ variable: "WS_TOKEN", id: "ws", destinations: ["ws.test:443"] }],
        destinations: [
          {
            host: "ws.test",
            port: 443,
            mode: "inspect",
            shape: {
              profile: "api",
              routes: [{ method: "GET", path: "/chat", stream: "websocket" }],
            },
          },
        ],
      },
      planContext(home),
      { stateDir, upstream: () => ws.target },
    );
    const handle = srv.containment.handles.get("ws")!;
    try {
      const ok = JSON.parse(
        (
          await srv.call("ws_exchange", {
            url: "wss://ws.test/chat",
            messages: ["hello", '{"op":"sub","auth":"' + handle + '"}'],
            ping: "keepalive",
          })
        ).text,
      );
      expect(ok.status).toBe(101);
      expect(ok.extensions).toBe(false);
      expect(ok.received).toEqual(["echo:hello", expect.stringContaining("echo:")]);
      expect(ok.pong).toBe("keepalive");
      const bad = JSON.parse(
        (
          await srv.call("ws_exchange", {
            url: "wss://ws.test/chat",
            messages: ["first", "key AKIAIOSFODNN7EXAMPLE", "never"],
            expect: 3,
          })
        ).text,
      );
      expect(bad.closeCode).toBe(1008);
      expect(bad.closeReason).toBe("secret-in-request");
    } finally {
      await srv.close();
      await ws.close();
    }
    // The upstream saw the value (substituted for the handle), the
    // compression offer stripped, and nothing from the refused message on.
    expect(ws.offeredExtensions).toEqual(["", ""]);
    expect(ws.received).toEqual([
      "hello",
      '{"op":"sub","auth":"ws-secret-value-0001"}',
      "ping:keepalive",
      "first",
    ]);
    expect(refusals(srv.events).map((r) => r.code)).toEqual(["secret-in-request"]);
  });

  it("call binding: a recipient from another in-flight call is refused; calls taken one at a time are bound to themselves", async () => {
    const stand = await startStandIns({
      "api.postmarkapp.com": () => ({ status: 200, body: '{"ErrorCode":0}' }),
    });
    const start = () =>
      startContainedServer(
        {
          name: "postmark",
          command: "node",
          args: [path.join(FIXTURES, "postmark.cjs"), "stash"],
          env: {
            POSTMARK_SERVER_TOKEN: "pm-server-token-0001",
            DEFAULT_SENDER_EMAIL: "bot@company.test",
          },
        },
        {
          roots: [],
          packageRoot: FIXTURES,
          env: ["DEFAULT_SENDER_EMAIL"],
          secrets: [
            {
              variable: "POSTMARK_SERVER_TOKEN",
              id: "postmark",
              destinations: ["api.postmarkapp.com:443"],
            },
          ],
          destinations: [
            {
              host: "api.postmarkapp.com",
              port: 443,
              mode: "inspect",
              profiles: ["postmark"],
              constants: ["bot@company.test"],
              shape: {
                profile: "api",
                routes: [
                  {
                    method: "POST",
                    path: "/email",
                    body: { maxBytes: 65536, schema: POSTMARK_BODY },
                  },
                ],
                headers: ["x-postmark-server-token"],
              },
            },
          ],
        },
        planContext(home),
        { stateDir, upstream: stand.upstream },
      );
    // Taken one at a time (runCall): A goes out; B carries A's recipient as Bcc and is refused.
    const one = await start();
    let a;
    let b;
    try {
      [a, b] = await Promise.all([
        one.call("send_email", {
          to: "bob@example.test",
          subject: "a",
          textBody: "a",
          delayMs: 300,
        }),
        one.call("send_email", {
          to: "alice@example.test",
          subject: "b",
          textBody: "secret report",
        }),
      ]);
    } finally {
      await one.close();
    }
    expect(a.isError, a.text).toBe(false);
    expect(b.isError).toBe(true);
    expect(b.text).toContain("routing-field-not-from-call");
    expect(stand.requests.map((r) => JSON.parse(r.body).To)).toEqual(["bob@example.test"]);
    // Both in flight at once (a caller that does not wait): neither request can be attributed.
    const two = await start();
    let c;
    let d;
    try {
      [c, d] = await Promise.all([
        two.call(
          "send_email",
          { to: "carol@example.test", subject: "c", textBody: "c", delayMs: 400 },
          "concurrent",
        ),
        two.call(
          "send_email",
          { to: "dave@example.test", subject: "d", textBody: "d", delayMs: 100 },
          "concurrent",
        ),
      ]);
    } finally {
      await two.close();
      await stand.close();
    }
    // D's request went out while C was in flight too: refused. C's went out
    // after D had ended, bound to C alone, with C's own recipient: allowed.
    expect(d.isError).toBe(true);
    expect(d.text).toContain("call-ambiguous");
    expect(c.isError, c.text).toBe(false);
    expect(stand.requests.map((r) => JSON.parse(r.body).To)).toEqual([
      "bob@example.test",
      "carol@example.test",
    ]);
    expect(refusals(two.events).map((r) => r.code)).toContain("call-ambiguous");
  });

  it("opaque: TLS passes through only for the declared server name; cleartext is scanned and a credential never leaves whole", async () => {
    const tlsStand = await startRawStandIn({ tlsName: "db.opaque.test" });
    const tcpStand = await startRawStandIn({});
    const srv = await startContainedServer(
      { name: "ops", command: "node", args: [path.join(FIXTURES, "ops-server.cjs")] },
      {
        roots: [],
        packageRoot: FIXTURES,
        destinations: [
          { host: "db.opaque.test", port: 5432, mode: "opaque" },
          { host: "raw.opaque.test", port: 7000, mode: "opaque" },
        ],
      },
      planContext(home),
      {
        stateDir,
        upstream: (h): UpstreamTarget =>
          h === "db.opaque.test" ? tlsStand.target : tcpStand.target,
      },
    );
    try {
      const ok = JSON.parse(
        (
          await srv.call("raw_exchange", {
            host: "db.opaque.test",
            port: 5432,
            tls: true,
            servername: "db.opaque.test",
            ca: tlsStand.caPem,
            data: "select 1\n",
          })
        ).text,
      );
      expect(ok).toMatchObject({ received: "echo:select 1\n", error: null });
      const fronted = JSON.parse(
        (
          await srv.call("raw_exchange", {
            host: "db.opaque.test",
            port: 5432,
            tls: true,
            servername: "other-tenant.cdn.test",
            ca: tlsStand.caPem,
            data: "exfil\n",
          })
        ).text,
      );
      expect(fronted.received).toBe("");
      expect(fronted.error).not.toBeNull();
      const clear = JSON.parse(
        (await srv.call("raw_exchange", { host: "raw.opaque.test", port: 7000, data: "STATUS\n" }))
          .text,
      );
      expect(clear.received).toBe("echo:STATUS\n");
      const leak = JSON.parse(
        (
          await srv.call("raw_exchange", {
            host: "raw.opaque.test",
            port: 7000,
            chunks: ["AUTH AKIA", "IOSFODNN7EXAMPLE\n"],
          })
        ).text,
      );
      expect(leak.received).toBe("");
    } finally {
      await srv.close();
      await tlsStand.close();
      await tcpStand.close();
    }
    expect(tlsStand.received.join("")).not.toContain("exfil");
    expect(tcpStand.received.join("")).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(refusals(srv.events).map((r) => r.code)).toEqual([
      "opaque-tls-name-mismatch",
      "secret-in-request",
    ]);
  });

  it("gRPC streaming over h2 and h2c: each message is checked as it streams; a credential ends the call before it leaves", async () => {
    const tlsGrpc = await startGrpcStandIn({ tlsName: "grpc.api.test" });
    const plainGrpc = await startGrpcStandIn({});
    const srv = await startContainedServer(
      { name: "ops", command: "node", args: [path.join(FIXTURES, "ops-server.cjs")] },
      {
        roots: [],
        packageRoot: FIXTURES,
        destinations: [
          {
            host: "grpc.api.test",
            port: 443,
            mode: "inspect",
            shape: {
              profile: "api",
              routes: [{ method: "POST", path: "/chat.Chat/Talk", stream: "grpc" }],
            },
          },
          {
            host: "grpc.local.test",
            port: 8080,
            mode: "http",
            shape: {
              profile: "api",
              routes: [{ method: "POST", path: "/chat.Chat/Talk", stream: "grpc" }],
            },
          },
        ],
      },
      planContext(home),
      {
        stateDir,
        upstream: (h): UpstreamTarget =>
          h === "grpc.api.test" ? tlsGrpc.target : plainGrpc.target,
      },
    );
    try {
      for (const url of [
        "https://grpc.api.test/chat.Chat/Talk",
        "http://grpc.local.test:8080/chat.Chat/Talk",
      ]) {
        // Each message is sent only after the previous echo: a relay that
        // buffered the request body would never answer.
        const ok = JSON.parse(
          (await srv.call("grpc_bidi", { url, messages: ["one", "two", "three"] })).text,
        );
        expect([url, ok.echoes, ok.grpcStatus]).toEqual([
          url,
          ["echo:one", "echo:two", "echo:three"],
          "0",
        ]);
        const bad = JSON.parse(
          (
            await srv.call("grpc_bidi", {
              url,
              messages: ["fine", "token ghp_abcdefghijklmnopqrstuvwxyz0123456789", "after"],
            })
          ).text,
        );
        expect([url, bad.echoes]).toEqual([url, ["echo:fine"]]);
        expect(bad.grpcStatus === "7" || bad.error !== null).toBe(true);
      }
    } finally {
      await srv.close();
      await tlsGrpc.close();
      await plainGrpc.close();
    }
    for (const s of [tlsGrpc, plainGrpc]) {
      expect(s.received).toEqual(["one", "two", "three", "fine"]);
    }
    expect(refusals(srv.events).map((r) => r.code)).toEqual([
      "secret-in-request",
      "secret-in-request",
    ]);
  });

  it("false positive: an h2c upgrade offer (curl --http2 on http://) is answered as HTTP/1.1, through the same checks", async () => {
    const http = await import("node:http");
    const seen: string[] = [];
    const h1 = http.createServer((req, res) => {
      seen.push(`${req.method} ${req.url} upgrade=${req.headers.upgrade ?? "-"}`);
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("plain\n");
    });
    await new Promise<void>((r) => h1.listen(0, "127.0.0.1", () => r()));
    const port = (h1.address() as { port: number }).port;
    const srv = await startContainedServer(
      { name: "ops", command: "node", args: [path.join(FIXTURES, "ops-server.cjs")] },
      {
        roots: [],
        packageRoot: FIXTURES,
        destinations: [{ host: "web.local.test", port: 8080, mode: "http" }],
      },
      planContext(home),
      { stateDir, upstream: () => ({ host: "127.0.0.1", port }) },
    );
    try {
      const offer =
        "GET /status HTTP/1.1\r\nHost: web.local.test:8080\r\nConnection: Upgrade, HTTP2-Settings\r\nUpgrade: h2c\r\nHTTP2-Settings: AAMAAABkAAQCAAAAAAIAAAAA\r\n\r\n";
      const r = JSON.parse(
        (
          await srv.call("raw_exchange", {
            host: "web.local.test",
            port: 8080,
            data: offer,
            until: "plain",
          })
        ).text,
      );
      expect(r.received).toMatch(/^HTTP\/1\.1 200/);
      expect(r.received).toContain("plain");
      const leak = JSON.parse(
        (
          await srv.call("raw_exchange", {
            host: "web.local.test",
            port: 8080,
            data: offer.replace("/status", "/x?k=ghp_abcdefghijklmnopqrstuvwxyz0123456789"),
            until: "}",
          })
        ).text,
      );
      expect(leak.received).toMatch(/^HTTP\/1\.1 403/);
    } finally {
      await srv.close();
      await new Promise<void>((r) => h1.close(() => r()));
    }
    expect(seen).toEqual(["GET /status upgrade=-"]);
  });
});
