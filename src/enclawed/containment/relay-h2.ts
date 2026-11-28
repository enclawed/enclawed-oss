// HTTP/2 through the containment relay (M3): h2 over TLS for inspected
// destinations, and cleartext h2 (h2c, prior knowledge) for plain-HTTP
// destinations, through the same checks as HTTP/1.1 (./relay.ts).
//
//   - an ordinary request: the whole body is read (bounded), checked once,
//     and forwarded to an h2 upstream (trailers included), or over HTTP/1.1
//     when the upstream does not speak h2;
//   - gRPC (content-type application/grpc*): the request is a stream of
//     length-prefixed messages that may go on for the whole call (client
//     and bidirectional streaming). The headers are checked first; then
//     EVERY message is checked as it arrives (decompressed when the stream
//     declares gzip or deflate), bound to exactly one in-flight call at
//     that moment (or none for a background destination), and only then
//     forwarded. The answer streams back as it comes. A refused message
//     ends the call: PERMISSION_DENIED (grpc-status 7) when nothing was
//     answered yet, a reset stream otherwise; the upstream never sees it.

import http from "node:http";
import http2 from "node:http2";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import zlib from "node:zlib";
import type { ResolvedDestination } from "./plan.js";
import {
  HOP_BY_HOP,
  MAX_REQUEST_BODY,
  hostOf,
  readBody,
  refusal,
  type InFlightCall,
  type Refusal,
  type RelayCore,
} from "./relay-types.js";
import { verifyPinnedAnswer } from "./request-shape.js";

export type Allowed = (
  dest: ResolvedDestination,
  protocol: "http/1.1" | "h2",
  where: { method: string; path: string },
  status: number | undefined,
  call: InFlightCall | null,
) => void;

const isGrpc = (ct: unknown) => typeof ct === "string" && /^application\/grpc(\+|;|$)/i.test(ct);

/** Length-prefixed gRPC messages from a byte stream. */
export function createGrpcParser(max = MAX_REQUEST_BODY) {
  let buf: Buffer = Buffer.alloc(0);
  return {
    push(chunk: Buffer): {
      messages: Array<{ compressed: boolean; payload: Buffer }>;
      error: string | null;
    } {
      buf = buf.length === 0 ? chunk : Buffer.concat([buf, chunk]);
      const messages: Array<{ compressed: boolean; payload: Buffer }> = [];
      while (buf.length >= 5) {
        const flag = buf[0];
        const len = buf.readUInt32BE(1);
        if (flag > 1) {
          return { messages, error: `bad gRPC message flag ${flag}` };
        }
        if (len > max) {
          return { messages, error: `gRPC message larger than ${max} bytes` };
        }
        if (buf.length < 5 + len) {
          break;
        }
        messages.push({ compressed: flag === 1, payload: Buffer.from(buf.subarray(5, 5 + len)) });
        buf = buf.subarray(5 + len);
      }
      return { messages, error: null };
    },
    /** Bytes of an unfinished message at the end of the stream. */
    pending: () => buf.length,
  };
}

export function grpcFrame(compressed: boolean, payload: Buffer): Buffer {
  const head = Buffer.alloc(5);
  head[0] = compressed ? 1 : 0;
  head.writeUInt32BE(payload.length, 1);
  return Buffer.concat([head, payload]);
}

function grpcCodec(encoding: string | undefined) {
  switch ((encoding ?? "identity").toLowerCase()) {
    case "identity":
      return { decode: (b: Buffer) => b, encode: (b: Buffer) => b };
    case "gzip":
      return { decode: (b: Buffer) => zlib.gunzipSync(b), encode: (b: Buffer) => zlib.gzipSync(b) };
    case "deflate":
      return {
        decode: (b: Buffer) => zlib.inflateSync(b),
        encode: (b: Buffer) => zlib.deflateSync(b),
      };
    default:
      return null;
  }
}

export function createH2Relay(core: RelayCore, allowed: Allowed) {
  // Upstream h2 sessions, per destination; null: the upstream does not speak h2.
  const sessions = new Map<ResolvedDestination, Promise<http2.ClientHttp2Session | null>>();
  const plain = (dest: ResolvedDestination) => dest.mode === "http";

  const connectUpstream = (dest: ResolvedDestination): Promise<http2.ClientHttp2Session | null> => {
    const have = sessions.get(dest);
    if (have) {
      return have;
    }
    const up = core.upstreamOf(dest);
    const p = new Promise<http2.ClientHttp2Session | null>((resolve) => {
      const open = (sock: net.Socket) => {
        const session = http2.connect(
          `${plain(dest) ? "http" : "https"}://${dest.host}:${dest.port}`,
          {
            createConnection: () => sock,
            settings: { enablePush: false },
          },
        );
        session.once("connect", () => resolve(session));
        session.once("error", () => {
          sessions.delete(dest);
          resolve(null);
        });
        session.once("close", () => sessions.delete(dest));
      };
      if (plain(dest)) {
        // Prior knowledge: a server that is not h2 fails the preface.
        const sock = net.connect(up.port, up.host);
        sock.once("error", () => resolve(null));
        sock.once("connect", () => open(sock));
        return;
      }
      // Offer both; use h2 only when the upstream picks it.
      const sock = tls.connect({
        host: up.host,
        port: up.port,
        servername: dest.host,
        ALPNProtocols: ["h2", "http/1.1"],
        ...(up.ca ? { ca: up.ca } : {}),
      });
      sock.once("error", () => {
        sessions.delete(dest);
        resolve(null);
      });
      sock.once("secureConnect", () => {
        if (sock.alpnProtocol !== "h2") {
          sock.destroy();
          resolve(null);
          return;
        }
        open(sock);
      });
    });
    sessions.set(dest, p);
    // An upstream without h2 is asked again next time (it may be upgraded).
    void p.then((s) => {
      if (!s) {
        sessions.delete(dest);
      }
    });
    return p;
  };

  /** The upstream's answer streamed back on `stream`, trailers included. */
  const pipeAnswer = (
    upReq: http2.ClientHttp2Stream,
    stream: http2.ServerHttp2Stream,
    onStatus: (status: number) => void,
  ) => {
    let trailers: http2.OutgoingHttpHeaders = {};
    upReq.on("trailers", (t: http2.IncomingHttpHeaders) => {
      trailers = Object.fromEntries(
        Object.entries(t).filter(([k, v]) => !k.startsWith(":") && v !== undefined),
      ) as http2.OutgoingHttpHeaders;
    });
    upReq.on("response", (h: http2.IncomingHttpHeaders) => {
      const outHeaders: http2.OutgoingHttpHeaders = {};
      for (const [k, v] of Object.entries(h)) {
        if (v !== undefined && (k === ":status" || (!k.startsWith(":") && !HOP_BY_HOP.has(k)))) {
          outHeaders[k] = v;
        }
      }
      if (stream.destroyed || stream.closed) {
        return;
      }
      stream.respond(outHeaders, { waitForTrailers: true });
      stream.on("wantTrailers", () => {
        if (Object.keys(trailers).length > 0) {
          stream.sendTrailers(trailers);
        } else {
          stream.close();
        }
      });
      upReq.pipe(stream);
      onStatus(Number(h[":status"]));
    });
    stream.on("close", () => {
      if (!upReq.closed) {
        upReq.close(http2.constants.NGHTTP2_CANCEL);
      }
    });
  };

  const requestHeaders = (
    method: string,
    target: string,
    authority: string,
    dest: ResolvedDestination,
    pairs: ReadonlyArray<readonly [string, string]>,
    te: unknown,
  ): http2.OutgoingHttpHeaders => {
    const h: http2.OutgoingHttpHeaders = {
      ":method": method,
      ":path": target,
      ":authority": authority,
      ":scheme": plain(dest) ? "http" : "https",
    };
    for (const [k, v] of pairs) {
      const key = k.toLowerCase();
      if (key === "te") {
        continue;
      }
      const existing = h[key];
      h[key] =
        existing === undefined
          ? v
          : Array.isArray(existing)
            ? [...existing, v]
            : [String(existing), v];
    }
    if (typeof te === "string" && te.toLowerCase() === "trailers") {
      h.te = "trailers";
    }
    return h;
  };

  const handleH2 = async (
    dest: ResolvedDestination,
    stream: http2.ServerHttp2Stream,
    hdrs: http2.IncomingHttpHeaders,
    rawHeaders: string[],
  ): Promise<void> => {
    const method = hdrs[":method"] ?? "GET";
    const target = hdrs[":path"] ?? "/";
    const where = { method, path: target.split("?")[0] };
    const grpc = isGrpc(hdrs["content-type"]);
    // A stream this side resets reports it as an error: expected, not a fault.
    stream.on("error", () => {});
    const refuse = (r: Refusal) => {
      core.refuseEvent(r.code, dest.host, dest.port, r.message, where);
      if (stream.destroyed || stream.closed) {
        return;
      }
      if (!stream.headersSent) {
        if (grpc) {
          // A trailers-only answer: the call fails with PERMISSION_DENIED.
          stream.respond(
            {
              ":status": 200,
              "content-type": "application/grpc",
              "grpc-status": "7",
              "grpc-message": encodeURIComponent(`enclawed-containment: ${r.code}`),
              "x-enclawed-refused": r.code,
            },
            { endStream: true },
          );
          return;
        }
        stream.respond({
          ":status": 403,
          "content-type": "application/json",
          "x-enclawed-refused": r.code,
        });
        stream.end(
          JSON.stringify({ error: "enclawed-containment", code: r.code, message: r.message }),
        );
      } else {
        stream.close(http2.constants.NGHTTP2_REFUSED_STREAM);
      }
    };
    const bound = core.bind(dest);
    if (!bound.ok) {
      refuse(bound);
      return;
    }
    const authority = hdrs[":authority"] ?? hdrs.host ?? "";
    if (hostOf(authority) !== dest.host) {
      refuse(
        refusal(
          "host-header-mismatch",
          `request :authority "${authority}" is not the destination ${dest.host}`,
        ),
      );
      return;
    }
    const pairs: Array<[string, string]> = [];
    const headers: Record<string, string | string[] | undefined> = {};
    for (let i = 0; i < rawHeaders.length; i += 2) {
      const k = rawHeaders[i];
      if (!k.startsWith(":")) {
        pairs.push([k, rawHeaders[i + 1]]);
        headers[k.toLowerCase()] = hdrs[k.toLowerCase()];
      }
    }
    if (grpc) {
      await streamGrpc(
        dest,
        stream,
        hdrs,
        { method, target, authority, pairs, headers },
        bound.call,
        refuse,
        where,
      );
      return;
    }
    const body = await readBody(stream);
    if (body === null) {
      refuse(
        refusal(
          "request-too-large",
          `request body larger than ${MAX_REQUEST_BODY} bytes cannot be inspected`,
        ),
      );
      return;
    }
    const enc = hdrs["content-encoding"];
    const out = await core.inspect(
      dest,
      {
        method,
        target,
        authority,
        headerPairs: pairs,
        headers,
        body,
        contentEncoding: typeof enc === "string" ? enc : undefined,
      },
      bound.call,
      "request",
    );
    if (!out.ok) {
      refuse(out);
      return;
    }
    // A registry destination is forwarded over HTTP/1.1, where a pinned
    // artifact's answer is verified before it is relayed.
    const registry = dest.shape?.profile === "npm-registry" || dest.shape?.profile === "pypi";
    const session = registry ? null : await connectUpstream(dest);
    if (!session) {
      // The upstream speaks HTTP/1.1 only: forward over it, answer over h2.
      const up = core.upstreamOf(dest);
      const h1: Record<string, string | string[]> = {};
      for (const [k, v] of out.headerPairs) {
        if (k.toLowerCase() !== "te") {
          h1[k] = v;
        }
      }
      h1.host = authority;
      h1["content-length"] = String(out.body.length);
      const opts = {
        host: up.host,
        port: up.port,
        method,
        path: out.target,
        headers: h1,
        agent: false as const,
      };
      const upReq = plain(dest)
        ? http.request(opts)
        : https.request({ ...opts, servername: dest.host, ...(up.ca ? { ca: up.ca } : {}) });
      upReq.on("response", (upRes) => {
        if (out.pin) {
          void verifyPinnedAnswer(upRes, out.pin).then((v) => {
            if (!v.ok) {
              refuse(refusal(v.code, v.message));
              return;
            }
            if (stream.destroyed || stream.closed) {
              v.discard();
              return;
            }
            const verified: http2.OutgoingHttpHeaders = {
              ":status": v.status,
              "content-length": String(v.size),
            };
            for (const [k, x] of Object.entries(v.headers)) {
              if (!HOP_BY_HOP.has(k)) {
                verified[k] = x;
              }
            }
            stream.respond(verified);
            v.open().pipe(stream);
            allowed(dest, "h2", where, v.status, bound.call);
          });
          return;
        }
        const outHeaders: http2.OutgoingHttpHeaders = { ":status": upRes.statusCode ?? 502 };
        for (const [k, v] of Object.entries(upRes.headers)) {
          if (v !== undefined && !HOP_BY_HOP.has(k)) {
            outHeaders[k] = v;
          }
        }
        stream.respond(outHeaders);
        upRes.pipe(stream);
        allowed(dest, "h2", where, upRes.statusCode, bound.call);
      });
      upReq.on("error", (err) =>
        refuse(refusal("upstream-failed", `upstream ${dest.host}:${dest.port}: ${err.message}`)),
      );
      upReq.end(out.body);
      return;
    }
    let upReq: http2.ClientHttp2Stream;
    try {
      upReq = session.request(
        requestHeaders(method, out.target, authority, dest, out.headerPairs, hdrs.te),
        {
          endStream: false,
        },
      );
    } catch (err) {
      refuse(
        refusal(
          "upstream-failed",
          `upstream ${dest.host}:${dest.port}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
      return;
    }
    pipeAnswer(upReq, stream, (status) => allowed(dest, "h2", where, status, bound.call));
    upReq.on("error", (err) =>
      refuse(refusal("upstream-failed", `upstream ${dest.host}:${dest.port}: ${err.message}`)),
    );
    upReq.end(out.body);
  };

  const streamGrpc = async (
    dest: ResolvedDestination,
    stream: http2.ServerHttp2Stream,
    hdrs: http2.IncomingHttpHeaders,
    req: {
      method: string;
      target: string;
      authority: string;
      pairs: Array<[string, string]>;
      headers: Record<string, string | string[] | undefined>;
    },
    call: InFlightCall | null,
    refuse: (r: Refusal) => void,
    where: { method: string; path: string },
  ): Promise<void> => {
    // Pause until the headers are checked and the upstream is open.
    stream.pause();
    const encoding = hdrs["grpc-encoding"];
    const codec = grpcCodec(typeof encoding === "string" ? encoding : undefined);
    if (!codec) {
      refuse(
        refusal(
          "request-encoding-unsupported",
          `gRPC encoding "${String(encoding)}" cannot be inspected`,
        ),
      );
      return;
    }
    const head = await core.inspect(
      dest,
      {
        method: req.method,
        target: req.target,
        authority: req.authority,
        headerPairs: req.pairs,
        headers: req.headers,
        body: Buffer.alloc(0),
      },
      call,
      "request",
    );
    if (!head.ok) {
      refuse(head);
      return;
    }
    const session = await connectUpstream(dest);
    if (!session) {
      refuse(refusal("upstream-failed", `gRPC to ${dest.host}:${dest.port} needs an h2 upstream`));
      return;
    }
    let upReq: http2.ClientHttp2Stream;
    try {
      upReq = session.request(
        requestHeaders(req.method, head.target, req.authority, dest, head.headerPairs, hdrs.te),
        {
          endStream: false,
        },
      );
    } catch (err) {
      refuse(
        refusal(
          "upstream-failed",
          `upstream ${dest.host}:${dest.port}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
      return;
    }
    let failed = false;
    const fail = (r: Refusal) => {
      if (failed) {
        return;
      }
      failed = true;
      if (!upReq.closed) {
        upReq.close(http2.constants.NGHTTP2_CANCEL);
      }
      refuse(r);
    };
    pipeAnswer(upReq, stream, (status) => allowed(dest, "h2", where, status, call));
    upReq.on("error", (err) =>
      fail(refusal("upstream-failed", `upstream ${dest.host}:${dest.port}: ${err.message}`)),
    );
    const parser = createGrpcParser();
    const contentType =
      typeof hdrs["content-type"] === "string" ? hdrs["content-type"] : "application/grpc";
    // Messages are checked and forwarded strictly in order.
    let chain = Promise.resolve();
    const forward = async (m: { compressed: boolean; payload: Buffer }) => {
      if (failed) {
        return;
      }
      const bound = core.bind(dest);
      if (!bound.ok) {
        fail(bound);
        return;
      }
      let decoded: Buffer;
      try {
        decoded = m.compressed ? codec.decode(m.payload) : m.payload;
      } catch {
        fail(refusal("request-encoding-unsupported", "a gRPC message could not be decompressed"));
        return;
      }
      const out = await core.inspect(
        dest,
        {
          method: req.method,
          target: req.target,
          authority: req.authority,
          headerPairs: [],
          headers: { "content-type": contentType },
          body: decoded,
        },
        bound.call,
        "message",
      );
      if (!out.ok) {
        fail(out);
        return;
      }
      const body = out.body.equals(decoded)
        ? m.payload
        : m.compressed
          ? codec.encode(out.body)
          : out.body;
      upReq.write(grpcFrame(m.compressed, body));
    };
    stream.on("data", (chunk: Buffer) => {
      const r = parser.push(chunk);
      for (const m of r.messages) {
        chain = chain
          .then(() => forward(m))
          .catch(() => fail(refusal("upstream-failed", "message relay failed")));
      }
      if (r.error) {
        const e = r.error;
        chain = chain.then(() => fail(refusal("request-too-large", e)));
      }
    });
    stream.on("end", () => {
      chain = chain.then(() => {
        if (failed) {
          return;
        }
        if (parser.pending() > 0) {
          fail(refusal("routing-body-unparseable", "the gRPC stream ended inside a message"));
          return;
        }
        upReq.end();
      });
    });
    stream.resume();
  };

  return {
    handleH2,
    close() {
      for (const p of sessions.values()) {
        void p.then((s) => s?.destroy());
      }
    },
  };
}
