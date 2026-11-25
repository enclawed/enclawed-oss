// Shared helpers for the containment live tests: isolated temp trees, local
// HTTPS stand-ins for remote APIs, and a JSON-RPC client that drives a
// contained MCP server the way an adapter's proxy does (beginCall/endCall
// around each tools/call). No real external host is ever contacted: every
// destination name is mapped to a local stand-in by `upstream`.

import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http2 from "node:http2";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";
import { fileURLToPath } from "node:url";
import type { Containment, ContainmentEvent, OpenContainmentOptions } from "./host.js";
import {
  containMcpServer,
  containProjectScript,
  type McpContainmentRecord,
  type ProjectScriptInput,
} from "./mcp.js";
import type { PlanContext } from "./plan.js";
import type { UpstreamTarget } from "./relay.js";
import type { JsonSchema } from "./request-shape-profiles.js";
import { createContainerCa, type ContainerCa } from "./x509.js";

/** The JSON body the postmark stand-in sends (its explicit api profile in the tests). */
export const POSTMARK_BODY: JsonSchema = {
  type: "object",
  properties: {
    From: { type: "string", maxLength: 320 },
    To: { type: "string", maxLength: 2000 },
    Cc: { type: "string", maxLength: 2000 },
    Bcc: { type: "string", maxLength: 2000 },
    Subject: { type: "string", maxLength: 2000 },
    TextBody: { type: "string", maxLength: 65536 },
  },
};

export const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "test-fixtures");

export function tempTree(prefix: string): string {
  const base = process.env.ENCLAWED_CONTAINMENT_TEST_DIR ?? os.tmpdir();
  fs.mkdirSync(base, { recursive: true });
  return fs.mkdtempSync(path.join(base, `${prefix}-`));
}

/** A fake user home with credential stores and agent config, as an attacker would look for them. */
export function fakeHome(root: string): string {
  const home = path.join(root, "home");
  fs.mkdirSync(path.join(home, ".aws"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".aws", "credentials"),
    "[default]\naws_access_key_id = AKIAIOSFODNN7EXAMPLE\naws_secret_access_key = fake\n",
  );
  fs.mkdirSync(path.join(home, ".ssh"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".ssh", "id_ed25519"),
    "-----BEGIN OPENSSH PRIVATE KEY-----\nfake\n",
  );
  fs.writeFileSync(path.join(home, ".bashrc"), "# original bashrc\n");
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(home, ".claude", "settings.json"), "{}\n");
  return home;
}

export function planContext(home: string): PlanContext {
  const uid = process.getuid?.() ?? 1000;
  return { home, uid: uid === 0 ? 1000 : uid, gid: 1000 };
}

export type Recorded = {
  host: string;
  method: string;
  path: string;
  headers: Record<string, unknown>;
  body: string;
  httpVersion: string;
};

export type StandInReply = {
  status: number;
  body: string | Buffer;
  headers?: Record<string, string>;
  trailers?: Record<string, string>;
};

/** Local HTTPS stand-ins (HTTP/1.1 and h2): one server, one certificate per name, trust via a test CA. */
export async function startStandIns(
  handlers: Record<string, (r: Recorded) => StandInReply>,
): Promise<{
  upstream: (host: string, port: number) => UpstreamTarget;
  requests: Recorded[];
  close: () => Promise<void>;
}> {
  const names = Object.keys(handlers);
  const ca: ContainerCa = createContainerCa("upstream stand-ins", names);
  const requests: Recorded[] = [];
  const first = ca.leafFor(names[0]);
  const server = http2.createSecureServer(
    {
      key: first.keyPem,
      cert: first.certPem,
      allowHTTP1: true,
      SNICallback: (name, cb) => {
        try {
          const leaf = ca.leafFor(name);
          cb(null, tls.createSecureContext({ key: leaf.keyPem, cert: leaf.certPem }));
        } catch (err) {
          cb(err as Error);
        }
      },
    },
    (req, res) => {
      let body = "";
      req.on("data", (c: Buffer) => (body += c.toString("utf8")));
      req.on("end", () => {
        const host = (req.headers[":authority"] ?? req.headers.host ?? "").replace(/:\d+$/, "");
        const rec: Recorded = {
          host,
          method: req.method ?? "",
          path: req.url ?? "",
          headers: req.headers as Record<string, unknown>,
          body,
          httpVersion: req.httpVersion,
        };
        requests.push(rec);
        const h = handlers[host];
        const out = h ? h(rec) : { status: 404, body: "no stand-in" };
        res.writeHead(out.status, { "content-type": "application/json", ...out.headers });
        if (out.trailers) {
          res.addTrailers(out.trailers);
        }
        res.end(out.body);
      });
    },
  );
  const sessions = new Set<http2.ServerHttp2Session>();
  server.on("session", (s) => {
    sessions.add(s);
    s.on("close", () => sessions.delete(s));
  });
  const sockets = new Set<net.Socket>();
  server.on("connection", (s: net.Socket) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as { port: number }).port;
  return {
    upstream: () => ({ host: "127.0.0.1", port, ca: ca.certPem }),
    requests,
    close: () =>
      new Promise<void>((r) => {
        for (const s of sessions) {
          s.destroy();
        }
        for (const s of sockets) {
          s.destroy();
        }
        server.close(() => r());
      }),
  };
}

/** A WebSocket echo stand-in (HTTPS, HTTP/1.1 upgrade): records every message it receives. */
export async function startWsStandIn(name: string): Promise<{
  target: UpstreamTarget;
  received: string[];
  offeredExtensions: string[];
  close: () => Promise<void>;
}> {
  const ca = createContainerCa("ws stand-in", [name]);
  const leaf = ca.leafFor(name);
  const received: string[] = [];
  const offeredExtensions: string[] = [];
  const server = https.createServer({ key: leaf.keyPem, cert: leaf.certPem }, (_req, res) => {
    res.writeHead(426);
    res.end("upgrade required");
  });
  const sockets = new Set<net.Socket>();
  server.on("upgrade", (req, sock: net.Socket) => {
    sockets.add(sock);
    sock.on("close", () => sockets.delete(sock));
    offeredExtensions.push(req.headers["sec-websocket-extensions"] ?? "");
    const accept = createHash("sha1")
      .update(`${String(req.headers["sec-websocket-key"])}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");
    sock.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    let buf = Buffer.alloc(0);
    sock.on("data", (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 2) {
        const op = buf[0] & 0x0f;
        let len = buf[1] & 0x7f;
        let off = 2;
        if (len === 126) {
          if (buf.length < 4) {
            return;
          }
          len = buf.readUInt16BE(2);
          off = 4;
        }
        if (buf.length < off + 4 + len) {
          return;
        }
        const key = buf.subarray(off, off + 4);
        const payload = Buffer.alloc(len);
        for (let i = 0; i < len; i++) {
          payload[i] = buf[off + 4 + i] ^ key[i & 3];
        }
        buf = buf.subarray(off + 4 + len);
        const frame = (opcode: number, p: Buffer) =>
          Buffer.concat([Buffer.from([0x80 | opcode, p.length]), p]);
        if (op === 0x1) {
          const text = payload.toString("utf8");
          received.push(text);
          sock.write(frame(0x1, Buffer.from(`echo:${text}`.slice(0, 125))));
        } else if (op === 0x9) {
          received.push(`ping:${payload.toString("utf8")}`);
          sock.write(frame(0xa, payload));
        } else if (op === 0x8) {
          sock.end(frame(0x8, payload.subarray(0, 2)));
        }
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as { port: number }).port;
  return {
    target: { host: "127.0.0.1", port, ca: ca.certPem },
    received,
    offeredExtensions,
    close: () =>
      new Promise<void>((r) => {
        for (const s of sockets) {
          s.destroy();
        }
        server.close(() => r());
      }),
  };
}

/**
 * A gRPC-style stand-in: echoes each length-prefixed message the moment it
 * arrives (bidirectional streaming), then trailers grpc-status 0. TLS h2 for
 * `tlsName`, cleartext h2 (h2c) otherwise.
 */
export async function startGrpcStandIn(o: { tlsName?: string }): Promise<{
  target: UpstreamTarget;
  received: string[];
  close: () => Promise<void>;
}> {
  const received: string[] = [];
  const onStream = (stream: http2.ServerHttp2Stream) => {
    stream.respond(
      { ":status": 200, "content-type": "application/grpc" },
      { waitForTrailers: true },
    );
    stream.on("wantTrailers", () => stream.sendTrailers({ "grpc-status": "0" }));
    let buf = Buffer.alloc(0);
    stream.on("data", (c: Buffer) => {
      buf = Buffer.concat([buf, c]);
      while (buf.length >= 5 && buf.length >= 5 + buf.readUInt32BE(1)) {
        const len = buf.readUInt32BE(1);
        const text = buf.subarray(5, 5 + len).toString();
        buf = buf.subarray(5 + len);
        received.push(text);
        const p = Buffer.from(`echo:${text}`);
        const h = Buffer.alloc(5);
        h.writeUInt32BE(p.length, 1);
        stream.write(Buffer.concat([h, p]));
      }
    });
    stream.on("end", () => stream.end());
    stream.on("error", () => {});
  };
  let ca: string | undefined;
  let server: http2.Http2Server | http2.Http2SecureServer;
  if (o.tlsName) {
    const c = createContainerCa("grpc stand-in", [o.tlsName]);
    const leaf = c.leafFor(o.tlsName);
    ca = c.certPem;
    server = http2.createSecureServer({ key: leaf.keyPem, cert: leaf.certPem });
  } else {
    server = http2.createServer();
  }
  server.on("stream", onStream);
  const sessions = new Set<http2.ServerHttp2Session>();
  server.on("session", (s: http2.ServerHttp2Session) => {
    sessions.add(s);
    s.on("close", () => sessions.delete(s));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as { port: number }).port;
  return {
    target: { host: "127.0.0.1", port, ...(ca ? { ca } : {}) },
    received,
    close: () =>
      new Promise<void>((r) => {
        for (const s of sessions) {
          s.destroy();
        }
        server.close(() => r());
      }),
  };
}

/** A raw stand-in for opaque destinations: TLS (its own CA) or plain TCP; answers each line with "echo:<line>". */
export async function startRawStandIn(o: { tlsName?: string }): Promise<{
  target: UpstreamTarget;
  caPem: string | null;
  received: string[];
  close: () => Promise<void>;
}> {
  const received: string[] = [];
  const onSocket = (sock: net.Socket) => {
    let buf = "";
    sock.on("data", (c: Buffer) => {
      buf += c.toString("utf8");
      received.push(c.toString("utf8"));
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        sock.write(`echo:${line}\n`);
      }
    });
    sock.on("error", () => {});
  };
  let caPem: string | null = null;
  let server: net.Server;
  if (o.tlsName) {
    const ca = createContainerCa("raw stand-in", [o.tlsName]);
    const leaf = ca.leafFor(o.tlsName);
    caPem = ca.certPem;
    server = tls.createServer(
      { key: leaf.keyPem, cert: leaf.certPem, ALPNProtocols: ["x-test"] },
      onSocket,
    );
  } else {
    server = net.createServer(onSocket);
  }
  const sockets = new Set<net.Socket>();
  server.on(o.tlsName ? "secureConnection" : "connection", (s: net.Socket) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as { port: number }).port;
  return {
    target: { host: "127.0.0.1", port },
    caPem,
    received,
    close: () =>
      new Promise<void>((r) => {
        for (const s of sockets) {
          s.destroy();
        }
        server.close(() => r());
      }),
  };
}

export type ContainedServer = {
  child: ChildProcess;
  containment: Containment;
  events: ContainmentEvent[];
  stderr: () => string;
  /**
   * One tools/call. "exclusive" (default): through runCall, one call at a
   * time. "concurrent": beginCall/endCall at once, as a caller that does not
   * wait for its turn would.
   */
  call(
    tool: string,
    args: Record<string, unknown>,
    mode?: "exclusive" | "concurrent",
  ): Promise<{ isError: boolean; text: string }>;
  close(): Promise<number | null>;
};

/** Start an MCP server contained and initialize it; throws with the refusal message when refused. */
export async function startContainedServer(
  def: {
    name: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
    cwd?: string;
  },
  rec: McpContainmentRecord,
  ctx: PlanContext,
  opts: Partial<OpenContainmentOptions> & { stateDir: string },
): Promise<ContainedServer> {
  const events: ContainmentEvent[] = [];
  const out = await containMcpServer(def, rec, { ...opts, onEvent: (e) => events.push(e) }, ctx);
  if (!out.ok) {
    throw Object.assign(new Error(out.message), { code: out.code });
  }
  const c = out.containment;
  const child = spawn(c.argv[0], c.argv.slice(1), {
    env: { ...c.env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let err = "";
  child.stderr.on("data", (d: Buffer) => (err += d.toString("utf8")));
  child.stdin.on("error", () => {}); // the server may be gone (stopped by the containment)
  const pending = new Map<number, (v: unknown) => void>();
  let buf = "";
  child.stdout.on("data", (d: Buffer) => {
    buf += d.toString("utf8");
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      try {
        const msg = JSON.parse(line) as { id?: number; result?: unknown };
        if (msg.id !== undefined && pending.has(msg.id)) {
          pending.get(msg.id)!(msg.result);
          pending.delete(msg.id);
        }
      } catch {
        /* not JSON-RPC */
      }
    }
  });
  let nextId = 1;
  const rpc = (method: string, params: unknown) =>
    new Promise<unknown>((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(
        () => reject(new Error(`timeout waiting for ${method}; stderr: ${err}`)),
        20_000,
      );
      pending.set(id, (v) => {
        clearTimeout(timer);
        resolve(v);
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  const exited = new Promise<number | null>((r) => child.on("exit", (code) => r(code)));
  await Promise.race([
    rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    }),
    exited.then((code) => {
      throw new Error(`contained server exited (${code}) before initializing: ${err}`);
    }),
  ]);
  return {
    child,
    containment: c,
    events,
    stderr: () => err,
    async call(tool, args, mode = "exclusive") {
      const callId = `call-${nextId++}-${tool}`;
      const run = async () => {
        const r = (await rpc("tools/call", { name: tool, arguments: args })) as {
          isError?: boolean;
          content?: { text: string }[];
        };
        return {
          isError: r.isError === true,
          text: r.content?.map((x) => x.text).join("\n") ?? "",
        };
      };
      const call = { callId, tool: `mcp__${def.name}__${tool}`, arguments: args };
      if (mode === "exclusive") {
        return c.runCall(call, run);
      }
      c.beginCall(call);
      try {
        return await run();
      } finally {
        c.endCall(callId);
      }
    },
    async close() {
      child.stdin.end();
      const t = setTimeout(() => child.kill("SIGTERM"), 3000);
      const code = await exited;
      clearTimeout(t);
      await c.close();
      return code;
    },
  };
}

/** Run a project script contained to completion. */
export async function runContainedScript(
  input: ProjectScriptInput,
  ctx: PlanContext,
  opts: Partial<OpenContainmentOptions> & { stateDir: string },
): Promise<{ code: number | null; stdout: string; stderr: string; events: ContainmentEvent[] }> {
  const events: ContainmentEvent[] = [];
  const out = await containProjectScript(input, { ...opts, onEvent: (e) => events.push(e) }, ctx);
  if (!out.ok) {
    throw Object.assign(new Error(out.message), { code: out.code });
  }
  const c = out.containment;
  const child = spawn(c.argv[0], c.argv.slice(1), {
    env: { ...c.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
  child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
  const code = await new Promise<number | null>((r) => child.on("exit", (c2) => r(c2)));
  await c.close();
  return { code, stdout, stderr, events };
}

export function refusals(
  events: readonly ContainmentEvent[],
): Array<{ code: string; message: string }> {
  return events
    .filter((e) => e.type === "egress-refused" || e.type === "refused")
    .map((e) => ({
      code: String((e as { code: unknown }).code),
      message: String((e as { message: unknown }).message),
    }));
}
