// WebSocket through the containment relay (M3): the upgrade request is
// checked like any request (./relay.ts), and then every message the
// contained process sends is checked like a request body before it is
// forwarded.
//
//   - handshake: GET with Upgrade: websocket, version 13 and a key; bound to
//     the call in flight (or a background destination); Host, secret
//     handles, DLP and routing provenance as for any request. Extensions
//     (permessage-deflate) are removed from the offer, so every message is
//     readable; an upstream that still answers with an extension is refused;
//   - client to server: frames are parsed (masking, fragmentation, control
//     frames, RFC 6455), each complete message is bound to exactly one
//     in-flight call (or none for a background destination) and inspected
//     (handles, DLP, routing provenance, egress pipeline, batcher slot), then
//     re-framed and forwarded. Outside a call, ping/pong/close frames carry
//     no payload onward, so they are no side channel;
//   - server to client: passed through.
// A refused message closes both sides with 1008 (policy violation).

import { randomBytes } from "node:crypto";
import http from "node:http";
import https from "node:https";
import type net from "node:net";
import type { ResolvedDestination } from "./plan.js";
import {
  MAX_REQUEST_BODY,
  refusal,
  type InFlightCall,
  type Refusal,
  type RelayCore,
} from "./relay-types.js";

const OP_CONT = 0x0;
const OP_TEXT = 0x1;
const OP_BINARY = 0x2;
const OP_CLOSE = 0x8;
const OP_PING = 0x9;
const OP_PONG = 0xa;

/** One frame, as sent by a client (masked) or by this relay to a client (unmasked). */
export function encodeFrame(opcode: number, payload: Buffer, mask: boolean): Buffer {
  const len = payload.length;
  const head: number[] = [0x80 | opcode];
  const m = mask ? 0x80 : 0;
  if (len < 126) {
    head.push(m | len);
  } else if (len < 65536) {
    head.push(m | 126, len >> 8, len & 0xff);
  } else {
    head.push(m | 127);
    const b = Buffer.alloc(8);
    b.writeBigUInt64BE(BigInt(len));
    head.push(...b);
  }
  if (!mask) {
    return Buffer.concat([Buffer.from(head), payload]);
  }
  const key = randomBytes(4);
  const body = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    body[i] = payload[i] ^ key[i & 3];
  }
  return Buffer.concat([Buffer.from(head), key, body]);
}

const closePayload = (code: number, reason = "") => {
  const r = Buffer.from(reason.slice(0, 100), "utf8");
  const b = Buffer.alloc(2 + r.length);
  b.writeUInt16BE(code, 0);
  r.copy(b, 2);
  return b;
};

export type WsMessage = Readonly<{ opcode: number; payload: Buffer }>;

/**
 * Incremental parser of client frames. Yields complete messages (data
 * messages reassembled from fragments, control frames as they come) or a
 * protocol error. Fail closed: unmasked frames, reserved bits (no
 * extension is negotiated), reserved opcodes, bad control frames and
 * oversize messages are errors.
 */
export function createClientFrameParser(max = MAX_REQUEST_BODY) {
  let buf: Buffer = Buffer.alloc(0);
  let fragOpcode = 0;
  let frags: Buffer[] = [];
  let fragSize = 0;
  return {
    push(chunk: Buffer): { messages: WsMessage[]; error: string | null } {
      buf = buf.length === 0 ? chunk : Buffer.concat([buf, chunk]);
      const messages: WsMessage[] = [];
      for (;;) {
        if (buf.length < 2) {
          break;
        }
        const b0 = buf[0];
        const b1 = buf[1];
        const fin = (b0 & 0x80) !== 0;
        const rsv = b0 & 0x70;
        const opcode = b0 & 0x0f;
        const masked = (b1 & 0x80) !== 0;
        let len = b1 & 0x7f;
        let off = 2;
        if (len === 126) {
          if (buf.length < 4) {
            break;
          }
          len = buf.readUInt16BE(2);
          off = 4;
        } else if (len === 127) {
          if (buf.length < 10) {
            break;
          }
          const big = buf.readBigUInt64BE(2);
          if (big > BigInt(max)) {
            return { messages, error: `frame larger than ${max} bytes` };
          }
          len = Number(big);
          off = 10;
        }
        if (!masked) {
          return { messages, error: "unmasked client frame" };
        }
        if (rsv !== 0) {
          return { messages, error: "reserved bits set (no extension was negotiated)" };
        }
        if (len > max) {
          return { messages, error: `frame larger than ${max} bytes` };
        }
        if (buf.length < off + 4 + len) {
          break;
        }
        const key = buf.subarray(off, off + 4);
        const payload = Buffer.alloc(len);
        for (let i = 0; i < len; i++) {
          payload[i] = buf[off + 4 + i] ^ key[i & 3];
        }
        buf = buf.subarray(off + 4 + len);
        if (opcode >= 0x8) {
          if (![OP_CLOSE, OP_PING, OP_PONG].includes(opcode)) {
            return { messages, error: `reserved control opcode ${opcode}` };
          }
          if (!fin || len > 125) {
            return { messages, error: "fragmented or oversize control frame" };
          }
          messages.push({ opcode, payload });
          continue;
        }
        if (opcode === OP_CONT) {
          if (fragOpcode === 0) {
            return { messages, error: "continuation without a message" };
          }
        } else if (opcode === OP_TEXT || opcode === OP_BINARY) {
          if (fragOpcode !== 0) {
            return { messages, error: "new message inside a fragmented one" };
          }
          fragOpcode = opcode;
        } else {
          return { messages, error: `reserved data opcode ${opcode}` };
        }
        fragSize += len;
        if (fragSize > max) {
          return { messages, error: `message larger than ${max} bytes` };
        }
        frags.push(payload);
        if (fin) {
          messages.push({ opcode: fragOpcode, payload: Buffer.concat(frags) });
          fragOpcode = 0;
          frags = [];
          fragSize = 0;
        }
      }
      return { messages, error: null };
    },
  };
}

function rawResponse(
  socket: net.Socket,
  status: number,
  body: string,
  extra: Record<string, string> = {},
) {
  const head = [
    `HTTP/1.1 ${status} ${http.STATUS_CODES[status] ?? ""}`,
    "content-type: application/json",
    `content-length: ${Buffer.byteLength(body)}`,
    "connection: close",
    ...Object.entries(extra).map(([k, v]) => `${k}: ${v}`),
    "",
    "",
  ].join("\r\n");
  socket.end(head + body);
}

export function serveWebSocket(
  core: RelayCore,
  dest: ResolvedDestination,
  req: http.IncomingMessage,
  client: net.Socket,
  head: Buffer,
): void {
  const target = req.url ?? "/";
  const where = { method: "GET", path: target.split("?")[0] };
  const refuseHandshake = (r: Refusal) => {
    core.refuseEvent(r.code, dest.host, dest.port, r.message, where);
    rawResponse(
      client,
      403,
      JSON.stringify({ error: "enclawed-containment", code: r.code, message: r.message }),
      { "x-enclawed-refused": r.code },
    );
  };
  const upgrade = (req.headers.upgrade ?? "").toLowerCase();
  if (
    upgrade !== "websocket" ||
    req.method !== "GET" ||
    req.headers["sec-websocket-version"] !== "13" ||
    typeof req.headers["sec-websocket-key"] !== "string"
  ) {
    refuseHandshake(
      refusal("upgrade-unsupported", `upgrade "${upgrade}" is not a WebSocket handshake; refused`),
    );
    return;
  }
  const bound = core.bind(dest);
  if (!bound.ok) {
    refuseHandshake(bound);
    return;
  }
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    // No extension is offered upstream: every message stays readable.
    if (req.rawHeaders[i].toLowerCase() !== "sec-websocket-extensions") {
      pairs.push([req.rawHeaders[i], req.rawHeaders[i + 1]]);
    }
  }
  const authority = req.headers.host ?? "";
  void core
    .inspect(
      dest,
      {
        method: "GET",
        target,
        authority,
        headerPairs: pairs,
        headers: req.headers,
        body: Buffer.alloc(0),
      },
      bound.call,
      "request",
    )
    .then((out) => {
      if (!out.ok) {
        refuseHandshake(out);
        return;
      }
      const headers: Record<string, string> = {};
      for (const [k, v] of out.headerPairs) {
        headers[k] = v;
      }
      headers.host = authority;
      headers.connection = "Upgrade";
      headers.upgrade = "websocket";
      const up = core.upstreamOf(dest);
      const client2 = dest.mode === "http" ? http : https;
      const upReq = client2.request({
        host: up.host,
        port: up.port,
        method: "GET",
        path: out.target,
        headers,
        ...(dest.mode === "http"
          ? {}
          : {
              servername: dest.host,
              ALPNProtocols: ["http/1.1"],
              ...(up.ca ? { ca: up.ca } : {}),
            }),
        agent: false,
      });
      upReq.on("error", (err) =>
        refuseHandshake(
          refusal("upstream-failed", `upstream ${dest.host}:${dest.port}: ${err.message}`),
        ),
      );
      upReq.on("response", (upRes) => {
        // Not upgraded: hand the answer back as it is.
        const chunks: Buffer[] = [];
        upRes.on("data", (c: Buffer) => chunks.push(c));
        upRes.on("end", () => {
          const body = Buffer.concat(chunks);
          const lines = [`HTTP/1.1 ${upRes.statusCode ?? 502} ${upRes.statusMessage ?? ""}`];
          for (let i = 0; i < upRes.rawHeaders.length; i += 2) {
            const k = upRes.rawHeaders[i].toLowerCase();
            if (!["connection", "transfer-encoding", "content-length", "keep-alive"].includes(k)) {
              lines.push(`${upRes.rawHeaders[i]}: ${upRes.rawHeaders[i + 1]}`);
            }
          }
          lines.push(`content-length: ${body.length}`, "connection: close", "", "");
          client.end(Buffer.concat([Buffer.from(lines.join("\r\n"), "latin1"), body]));
        });
      });
      upReq.on("upgrade", (upRes, upSock: net.Socket, upHead: Buffer) => {
        if (upRes.headers["sec-websocket-extensions"]) {
          upSock.destroy();
          refuseHandshake(
            refusal(
              "websocket-extension-refused",
              "the server negotiated a WebSocket extension that was not offered",
            ),
          );
          return;
        }
        const lines = ["HTTP/1.1 101 Switching Protocols"];
        for (let i = 0; i < upRes.rawHeaders.length; i += 2) {
          lines.push(`${upRes.rawHeaders[i]}: ${upRes.rawHeaders[i + 1]}`);
        }
        lines.push("", "");
        client.write(lines.join("\r\n"));
        if (upHead.length > 0) {
          client.write(upHead);
        }
        core.opts.onEvent({
          type: "egress-allowed",
          host: dest.host,
          port: dest.port,
          mode: dest.mode,
          protocol: "websocket",
          ...where,
          status: 101,
          callIds: bound.call ? [bound.call.callId] : [],
          at: core.now(),
        });
        relayFrames(core, dest, target, authority, client, upSock, head);
      });
      upReq.end();
    });
}

function relayFrames(
  core: RelayCore,
  dest: ResolvedDestination,
  target: string,
  authority: string,
  client: net.Socket,
  upSock: net.Socket,
  head: Buffer,
): void {
  const parser = createClientFrameParser();
  let closed = false;
  const shut = (r: Refusal) => {
    if (closed) {
      return;
    }
    closed = true;
    core.refuseEvent(r.code, dest.host, dest.port, r.message, {
      method: "WEBSOCKET",
      path: target.split("?")[0],
    });
    client.end(encodeFrame(OP_CLOSE, closePayload(1008, r.code), false));
    upSock.end(encodeFrame(OP_CLOSE, closePayload(1001), true));
    setTimeout(() => {
      client.destroy();
      upSock.destroy();
    }, 200).unref();
  };
  upSock.pipe(client);
  upSock.on("error", () => client.destroy());
  upSock.on("close", () => client.end());
  client.on("error", () => upSock.destroy());
  client.on("close", () => upSock.destroy());

  // Messages are checked and forwarded strictly in order.
  let chain = Promise.resolve();
  const forward = async (m: WsMessage) => {
    if (closed) {
      return;
    }
    const bound = core.bind(dest);
    if (m.opcode >= 0x8) {
      // Control frames: outside a call no payload goes on (no side channel);
      // inside one, the payload is checked like a message.
      if (!bound.ok || m.payload.length === 0) {
        const payload =
          m.opcode === OP_CLOSE && m.payload.length >= 2
            ? m.payload.subarray(0, 2)
            : Buffer.alloc(0);
        upSock.write(encodeFrame(m.opcode, payload, true));
        return;
      }
    } else if (!bound.ok) {
      shut(bound);
      return;
    }
    const call: InFlightCall | null = bound.ok ? bound.call : null;
    const text = m.opcode === OP_TEXT ? m.payload.toString("utf8") : null;
    const json = text !== null && /^\s*[[{]/.test(text);
    const out = await core.inspect(
      dest,
      {
        method: "WEBSOCKET",
        target,
        authority,
        headerPairs: [],
        headers: json ? { "content-type": "application/json" } : {},
        body: m.payload,
      },
      call,
      "message",
    );
    if (!out.ok) {
      shut(out);
      return;
    }
    if (m.opcode >= 0x8 && out.body.length > 125) {
      shut(refusal("websocket-protocol-error", "a control frame grew beyond 125 bytes"));
      return;
    }
    upSock.write(encodeFrame(m.opcode, out.body, true));
  };
  const onData = (chunk: Buffer) => {
    const r = parser.push(chunk);
    for (const m of r.messages) {
      chain = chain
        .then(() => forward(m))
        .catch(() => shut(refusal("websocket-protocol-error", "message relay failed")));
    }
    if (r.error) {
      const err = r.error;
      chain = chain.then(() => shut(refusal("websocket-protocol-error", err)));
    }
  };
  if (head.length > 0) {
    onData(head);
  }
  client.on("data", onData);
}
