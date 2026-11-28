// A contained test server that does what an attacker (or a legitimate
// client) would do from inside: filesystem operations, a busy loop that
// tries to plant a file, and HTTP/2, WebSocket and raw TCP/TLS clients.
// No dependencies. Every tool returns JSON text.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const tls = require("node:tls");
const http2 = require("node:http2");
const crypto = require("node:crypto");
const serve = require("./mcp-mini.cjs");

const code = (fn) => {
  try {
    fn();
    return "OK";
  } catch (e) {
    return e.code || e.message;
  }
};

function wsFrame(opcode, payload) {
  const len = payload.length;
  const head = [0x80 | opcode];
  if (len < 126) {
    head.push(0x80 | len);
  } else if (len < 65536) {
    head.push(0x80 | 126, len >> 8, len & 0xff);
  } else {
    throw new Error("too long for this client");
  }
  const key = crypto.randomBytes(4);
  const body = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    body[i] = payload[i] ^ key[i & 3];
  }
  return Buffer.concat([Buffer.from(head), key, body]);
}

function wsExchange(a) {
  const u = new URL(a.url);
  return new Promise((resolve) => {
    const out = { status: null, received: [], closeCode: null, error: null };
    const sock = tls.connect({
      host: u.hostname,
      port: Number(u.port) || 443,
      servername: u.hostname,
      ALPNProtocols: ["http/1.1"],
    });
    let buf = Buffer.alloc(0);
    let upgraded = false;
    const finish = () => {
      sock.destroy();
      resolve(out);
    };
    const timer = setTimeout(finish, a.timeoutMs || 5000);
    sock.on("error", (e) => {
      out.error = e.code || e.message;
      clearTimeout(timer);
      finish();
    });
    sock.on("secureConnect", () => {
      const key = crypto.randomBytes(16).toString("base64");
      sock.write(
        `GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Extensions: permessage-deflate\r\n` +
          (a.headers || []).map((h) => `${h}\r\n`).join("") +
          "\r\n",
      );
    });
    sock.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!upgraded) {
        const end = buf.indexOf("\r\n\r\n");
        if (end < 0) {
          return;
        }
        const head = buf.subarray(0, end).toString("latin1");
        out.status = Number(head.split(" ")[1]);
        out.extensions = /sec-websocket-extensions/i.test(head);
        buf = buf.subarray(end + 4);
        if (out.status !== 101) {
          out.body = buf.toString("utf8");
          clearTimeout(timer);
          return finish();
        }
        upgraded = true;
        for (const m of a.messages || []) {
          sock.write(wsFrame(0x1, Buffer.from(m)));
        }
        if (a.ping) {
          sock.write(wsFrame(0x9, Buffer.from(a.ping)));
        }
      }
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
        if (buf.length < off + len) {
          return;
        }
        const payload = buf.subarray(off, off + len);
        buf = buf.subarray(off + len);
        if (op === 0x8) {
          out.closeCode = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
          out.closeReason = payload.subarray(2).toString("utf8");
          clearTimeout(timer);
          return finish();
        }
        if (op === 0xa) {
          out.pong = payload.toString("utf8");
        }
        if (op === 0x1) {
          out.received.push(payload.toString("utf8"));
        }
        if (out.received.length >= (a.expect ?? (a.messages || []).length) && !a.ping) {
          clearTimeout(timer);
          return finish();
        }
        if (a.ping && out.pong !== undefined && out.received.length >= (a.expect ?? 0)) {
          clearTimeout(timer);
          return finish();
        }
      }
    });
  });
}

function h2Request(a) {
  const u = new URL(a.url);
  return new Promise((resolve) => {
    const s = http2.connect(u.origin);
    s.on("error", (e) => resolve({ error: e.code || e.message }));
    const req = s.request({
      ":method": a.method || "GET",
      ":path": u.pathname + u.search,
      te: "trailers",
      ...a.headers,
    });
    let status = null;
    let body = "";
    let trailers = null;
    req.on("response", (h) => (status = h[":status"]));
    req.on("trailers", (t) => (trailers = t));
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      s.close();
      resolve({ status, body, trailers, alpn: s.alpnProtocol });
    });
    req.on("error", (e) => {
      s.close();
      resolve({ error: e.code || e.message, status, body });
    });
    req.end(a.body);
  });
}

function rawExchange(a) {
  return new Promise((resolve) => {
    const out = { received: "", error: null };
    const opts = { host: a.host, port: a.port };
    const sock = a.tls
      ? tls.connect({ ...opts, servername: a.servername, ca: a.ca, ALPNProtocols: ["x-test"] })
      : net.connect(opts);
    const done = () => {
      sock.destroy();
      resolve(out);
    };
    const timer = setTimeout(done, a.timeoutMs || 4000);
    sock.on("error", (e) => {
      out.error = e.code || e.message;
      clearTimeout(timer);
      done();
    });
    sock.on(a.tls ? "secureConnect" : "connect", () => {
      for (const chunk of a.chunks || [a.data || ""]) {
        sock.write(chunk);
      }
    });
    sock.on("data", (c) => {
      out.received += c.toString("utf8");
      if (out.received.includes(a.until || "\n")) {
        clearTimeout(timer);
        done();
      }
    });
    sock.on("close", () => {
      clearTimeout(timer);
      done();
    });
  });
}

// gRPC-style bidirectional stream: send one framed message, wait for its
// echo, then the next (a buffering relay would deadlock here).
function grpcBidi(a) {
  const u = new URL(a.url);
  return new Promise((resolve) => {
    const out = { echoes: [], status: null, grpcStatus: null, grpcMessage: null, error: null };
    const s = http2.connect(u.origin);
    s.on("error", (e) => resolve({ ...out, error: e.code || e.message }));
    const req = s.request({
      ":method": "POST",
      ":path": u.pathname,
      "content-type": "application/grpc",
      te: "trailers",
    });
    const frame = (text) => {
      const p = Buffer.from(text);
      const h = Buffer.alloc(5);
      h.writeUInt32BE(p.length, 1);
      return Buffer.concat([h, p]);
    };
    const msgs = [...(a.messages || [])];
    let buf = Buffer.alloc(0);
    const next = () => {
      if (msgs.length > 0) {
        req.write(frame(msgs.shift()));
      } else {
        req.end();
      }
    };
    req.on("response", (h) => {
      out.status = h[":status"];
      if (h["grpc-status"] !== undefined) {
        out.grpcStatus = h["grpc-status"];
        out.grpcMessage = decodeURIComponent(h["grpc-message"] || "");
      }
    });
    req.on("data", (c) => {
      buf = Buffer.concat([buf, c]);
      while (buf.length >= 5 && buf.length >= 5 + buf.readUInt32BE(1)) {
        const len = buf.readUInt32BE(1);
        out.echoes.push(buf.subarray(5, 5 + len).toString());
        buf = buf.subarray(5 + len);
        next();
      }
    });
    req.on("trailers", (t) => {
      out.grpcStatus = t["grpc-status"];
      out.grpcMessage = decodeURIComponent(t["grpc-message"] || "");
    });
    const done = () => {
      s.close();
      resolve(out);
    };
    req.on("end", done);
    req.on("error", (e) => {
      out.error = e.code || e.message;
      done();
    });
    req.on("close", done);
    setTimeout(done, a.timeoutMs || 6000);
    next();
  });
}

serve("ops", {
  exec: {
    description: "run a program; returns its status and output",
    handler: (a) => {
      const r = require("node:child_process").spawnSync(a.cmd, a.args || [], {
        cwd: a.cwd,
        encoding: "utf8",
        env: { ...process.env, ...a.env },
      });
      return JSON.stringify({
        status: r.status,
        stdout: r.stdout,
        stderr: r.stderr,
        error: r.error && r.error.code,
      });
    },
  },
  grpc_bidi: {
    description: "gRPC-style bidirectional stream",
    handler: async (a) => JSON.stringify(await grpcBidi(a)),
  },
  fs_ops: {
    description: "filesystem operations; each returns OK or the error code",
    handler: (a) => {
      const r = {};
      for (const [i, op] of (a.ops || []).entries()) {
        const k = `${i}:${op.op}:${op.path}`;
        if (op.op === "write") {
          r[k] = code(() => fs.writeFileSync(op.path, op.content ?? "x"));
        } else if (op.op === "mkdirp") {
          r[k] = code(() => fs.mkdirSync(op.path, { recursive: true }));
        } else if (op.op === "rename") {
          r[k] = code(() => fs.renameSync(op.path, op.to));
        } else if (op.op === "rmdir") {
          r[k] = code(() => fs.rmdirSync(op.path));
        } else if (op.op === "unlink") {
          r[k] = code(() => fs.unlinkSync(op.path));
        } else if (op.op === "rmrf") {
          r[k] = code(() => fs.rmSync(op.path, { recursive: true }));
        } else if (op.op === "symlink") {
          r[k] = code(() => fs.symlinkSync(op.to, op.path));
        } else if (op.op === "link") {
          r[k] = code(() => fs.linkSync(op.to, op.path));
        } else if (op.op === "rplus") {
          // Open an existing file for writing without O_CREAT or O_TRUNC.
          r[k] = code(() => {
            const fd = fs.openSync(op.path, "r+");
            try {
              fs.writeSync(fd, op.content ?? "x");
            } finally {
              fs.closeSync(fd);
            }
          });
        } else if (op.op === "truncate") {
          r[k] = code(() => fs.truncateSync(op.path, 0));
        } else if (op.op === "append") {
          r[k] = code(() => fs.appendFileSync(op.path, op.content ?? "x"));
        } else if (op.op === "mkfifo") {
          r[k] = code(() => require("node:child_process").execFileSync("mkfifo", [op.path]));
        } else if (op.op === "reopen") {
          // Open read-only, then reopen the same file for writing through /proc/self/fd.
          r[k] = code(() => {
            const fd = fs.openSync(op.path, "r");
            try {
              fs.writeFileSync(`/proc/self/fd/${fd}`, op.content ?? "x");
            } finally {
              fs.closeSync(fd);
            }
          });
        } else if (op.op === "stdout") {
          r[k] = code(() => fs.writeFileSync("/dev/stdout", ""));
        } else if (op.op === "read") {
          r[k] = code(() => (r[`${k}:content`] = fs.readFileSync(op.path, "utf8")));
        }
      }
      return JSON.stringify(r);
    },
  },
  plant_loop: {
    description:
      "try, in a tight loop, to create `path` (and its parents) with `content`, until it works or `ms` pass",
    handler: (a) => {
      const end = Date.now() + (a.ms || 3000);
      let tries = 0;
      fs.writeFileSync(a.readyFile, "ready");
      while (Date.now() < end) {
        tries++;
        try {
          fs.mkdirSync(path.dirname(a.path), { recursive: true });
          fs.writeFileSync(a.path, a.content, { flag: "wx" });
          return JSON.stringify({ planted: true, tries });
        } catch {
          /* again */
        }
      }
      return JSON.stringify({ planted: false, tries });
    },
  },
  h2_request: {
    description: "HTTP/2 request",
    handler: async (a) => JSON.stringify(await h2Request(a)),
  },
  ws_exchange: {
    description: "WebSocket exchange",
    handler: async (a) => JSON.stringify(await wsExchange(a)),
  },
  raw_exchange: {
    description: "raw TCP or TLS exchange",
    handler: async (a) => JSON.stringify(await rawExchange(a)),
  },
});
