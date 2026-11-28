// Outbound relay for contained processes (M3), host side.
//
// A contained process has no route off the machine. Each connection it
// makes to a name it looked up arrives here (from ./contain-init.ts) with
// the name and port it meant. This side decides, per connection and per
// request (or WebSocket message):
//
//   1. destination: (name, port) must be declared in the admission record;
//   2. TLS (mode "inspect"): terminated with a leaf for that name signed by
//      the container's own name-constrained CA (./x509.ts); the TLS server
//      name must be the name the connection was made to. ALPN offers h2 and
//      http/1.1: both protocols, and WebSocket upgrades over HTTP/1.1, go
//      through the same checks;
//   3. call binding: every request (and every WebSocket message) is bound
//      to EXACTLY ONE in-flight tool call, or to none for a declared
//      background destination. With two or more calls in flight a request
//      cannot be attributed and is refused (call-ambiguous); the
//      containment admits calls one at a time (acquireCall) so a caller that
//      waits for its turn is never refused;
//   4. per request: the Host / :authority must be that name;
//   5. secret handles: replaced by their values only in requests to the
//      secret's declared destinations; a handle bound for anywhere else
//      refuses the request;
//   6. DLP: a structured credential in the request (or the raw value of
//      any declared secret, which the process should never hold) refuses it;
//   7. routing-field provenance (./routing.ts): every recipient or target in
//      the request must come from the BOUND call's arguments or the declared
//      constants;
//   8. Enclawed's egress pipeline (the stage registry, or a given runner),
//      then the choice-channel batcher's issue slot for the call;
//   9. forward to the real destination (h2 to an h2 client when the
//      upstream speaks it, trailers included), stream the answer back.
//
// A destination declared with a request shape (./request-shape.ts: a
// package registry, possibly behind an Artifactory-style proxy) adds, right
// after the Host check, the shape: only the profile's methods, path grammar
// and headers, no body, no query, no stream message. Its pinned artifacts
// are fetched whole over HTTP/1.1 and verified against the pin before a byte
// of the answer reaches the process (a mismatch is refused).
//
// Opaque destinations (./relay-opaque.ts) are passed through unread after
// the checks that need no plaintext: destination, call binding, the TLS
// server name of a passed-through handshake, and DLP on cleartext streams.
//
// Every refusal is an HTTP 403 to the process (so the tool call fails with
// a reason), a WebSocket close 1008, or a closed connection, and an event
// for the session. Fail closed: anything that cannot be read or decided is
// refused.

import http from "node:http";
import http2 from "node:http2";
import https from "node:https";
import type net from "node:net";
import { Duplex } from "node:stream";
import tls from "node:tls";
import zlib from "node:zlib";
import { createCapacityLedger, requestToolIssueSlot } from "@enclawed/egress-core";
import { credentialFindings, type ContainmentSecret, type ResolvedDestination } from "./plan.js";
import { createH2Relay } from "./relay-h2.js";
import { serveOpaque } from "./relay-opaque.js";
import {
  HOP_BY_HOP,
  MAX_REQUEST_BODY,
  hostOf,
  readBody,
  refusal,
  replaceBytes,
  type EgressRelay,
  type InFlightCall,
  type Refusal,
  type RelayCore,
  type RelayOptions,
  type RelayRefusalCode,
  type UpstreamTarget,
} from "./relay-types.js";
import { serveWebSocket } from "./relay-ws.js";
import { GENERIC_SHAPE, checkRequestShape, verifyPinnedAnswer } from "./request-shape.js";
import { checkRoutingProvenance, suppliedValues } from "./routing.js";

export {
  MAX_REQUEST_BODY,
  replaceBytes,
  type EgressRelay,
  type InFlightCall,
  type Inspected,
  type Refusal,
  type RelayCore,
  type RelayEvent,
  type RelayOptions,
  type RelayRefusalCode,
  type RequestFacts,
  type UpstreamTarget,
} from "./relay-types.js";

/** Longest delay the egress pipeline may impose on one request. */
const MAX_PIPELINE_DELAY_MS = 30_000;

/**
 * The capacity ledger of each generic-profile destination (internal
 * constants, never settings): a burst of 16 Kibit of path choice, refilled at
 * 64 bit/s. A request whose bits of choice (./request-shape-profiles.ts) do
 * not fit is refused (request-shape-capacity), so no declared destination
 * carries more than this out of the process, whatever its paths spell.
 */
export const GENERIC_LEDGER_BURST_BITS = 16 * 1024;
export const GENERIC_LEDGER_REFILL_BITS_PER_S = 64;

function decodeBody(encoding: string | undefined, body: Buffer): Buffer | null {
  const enc = (encoding ?? "identity").toLowerCase().trim();
  try {
    switch (enc) {
      case "":
      case "identity":
        return body;
      case "gzip":
      case "x-gzip":
        return zlib.gunzipSync(body);
      case "deflate":
        return zlib.inflateSync(body);
      case "br":
        return zlib.brotliDecompressSync(body);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function createEgressRelay(opts: RelayOptions): EgressRelay {
  const calls = new Map<string, InFlightCall>();
  // Calls waiting for their turn (acquireCall), first come first served.
  const queue: Array<() => void> = [];
  const sockets = new Set<net.Socket>();
  const now = () => new Date().toISOString();
  const ledgers = new Map<string, ReturnType<typeof createCapacityLedger>>();
  const ledgerOf = (key: string) => {
    let l = ledgers.get(key);
    if (!l) {
      l = createCapacityLedger({
        capacityBits: GENERIC_LEDGER_BURST_BITS,
        refillBitsPerSec: GENERIC_LEDGER_REFILL_BITS_PER_S,
        ...(opts.ledgerClock ? { now: opts.ledgerClock } : {}),
      });
      ledgers.set(key, l);
    }
    return l;
  };
  const findDest = (host: string | null, port: number) =>
    host
      ? (opts.destinations.find((d) => d.host === host.toLowerCase() && d.port === port) ?? null)
      : null;
  const refuseEvent: RelayCore["refuseEvent"] = (code, host, port, message, extra = {}) => {
    opts.onEvent({
      type: "egress-refused",
      code,
      host,
      port,
      ...extra,
      callIds: [...calls.keys()],
      message,
      at: now(),
    });
  };

  const bind: RelayCore["bind"] = (dest) => {
    const inFlight = [...calls.values()];
    if (inFlight.length > 1) {
      return refusal(
        "call-ambiguous",
        `request to ${dest.host} while ${inFlight.length} tool calls are in flight: it cannot be bound to one call`,
      );
    }
    if (inFlight.length === 0) {
      return dest.background
        ? { ok: true, call: null }
        : refusal(
            "no-call-in-flight",
            `request to ${dest.host} with no tool call in flight; not a declared background destination`,
          );
    }
    return { ok: true, call: inFlight[0] };
  };

  const inspect: RelayCore["inspect"] = async (dest, facts, call, kind) => {
    if (kind === "request" && hostOf(facts.authority) !== dest.host) {
      return refusal(
        "host-header-mismatch",
        `request Host "${facts.authority}" is not the destination ${dest.host}`,
      );
    }
    // The destination's request shape: what KIND of request may go there.
    // Every read destination has one: none declared is the generic profile
    // (no free-form egress; ./request-shape-profiles.ts).
    const shape = dest.shape ?? GENERIC_SHAPE;
    const shapeBody =
      shape.profile === "api" && facts.body.length > 0 && facts.body.length <= MAX_REQUEST_BODY
        ? decodeBody(facts.contentEncoding, facts.body)
        : null;
    const shaped = checkRequestShape(shape, {
      method: facts.method,
      target: facts.target,
      headerPairs: facts.headerPairs,
      bodyLength: facts.body.length,
      body: shapeBody,
      kind,
    });
    if (!shaped.ok) {
      return refusal(shaped.code, shaped.message);
    }
    // Its bits of choice, charged against the destination's capacity ledger.
    if (shaped.bits > 0 && !ledgerOf(`${dest.host}:${dest.port}`).tryConsume(shaped.bits)) {
      return refusal(
        "request-shape-capacity",
        `${dest.host} takes no more requests now: the paths sent to it already carried what a destination without an API profile may carry`,
      );
    }
    if (facts.body.length > MAX_REQUEST_BODY) {
      return refusal(
        "request-too-large",
        `request body larger than ${MAX_REQUEST_BODY} bytes cannot be inspected`,
      );
    }
    const decoded = decodeBody(facts.contentEncoding, facts.body);
    if (decoded === null) {
      return refusal(
        "request-encoding-unsupported",
        `request body encoding "${String(facts.contentEncoding)}" cannot be inspected`,
      );
    }
    const encoded = decoded !== facts.body;

    // Secret handles: where may each go?
    const headerText = facts.headerPairs.map(([k, v]) => `${k}\n${v}`).join("\n");
    const bodyText = decoded.toString("utf8");
    const destKey = `${dest.host}:${dest.port}`;
    const present: ContainmentSecret[] = [];
    for (const s of opts.secrets) {
      const handle = opts.handles.get(s.id);
      if (!handle) {
        continue;
      }
      if (
        facts.target.includes(handle) ||
        headerText.includes(handle) ||
        bodyText.includes(handle)
      ) {
        if (!s.destinations.map((d) => d.toLowerCase()).includes(destKey)) {
          return refusal(
            "secret-handle-wrong-destination",
            `secret ${s.id} may only be sent to ${s.destinations.join(", ")}, not ${destKey}`,
          );
        }
        if (encoded && bodyText.includes(handle)) {
          return refusal(
            "secret-handle-in-encoded-body",
            `secret ${s.id} appears in a compressed body, where it cannot be substituted`,
          );
        }
        present.push(s);
      }
    }

    // DLP: structured credentials, or a declared secret's real value.
    const inspected = `${facts.target}\n${headerText}\n${bodyText}`;
    const found = credentialFindings(inspected);
    if (found.length > 0) {
      return refusal("secret-in-request", `the request carries a credential (${found.join(", ")})`);
    }
    for (const [id, value] of opts.secretValues) {
      if (value.length >= 8 && inspected.includes(value)) {
        return refusal(
          "secret-in-request",
          `the request carries the value of secret ${id}, which the process should only hold as a handle`,
        );
      }
    }

    // Routing-field provenance: values from the bound call and the declared constants only.
    const supplied = suppliedValues([...(call ? [call.arguments] : []), ...dest.constants]);
    const contentType = facts.headers["content-type"];
    const routing = checkRoutingProvenance(
      {
        host: dest.host,
        method: facts.method,
        target: facts.target,
        headers: facts.headers,
        contentType: typeof contentType === "string" ? contentType : undefined,
        body: decoded,
      },
      dest.profiles,
      supplied,
    );
    if (!routing.ok) {
      return refusal(routing.code, routing.message);
    }

    // Enclawed's egress pipeline on the outbound body.
    let outBody = facts.body;
    if (opts.egressRunner && bodyText.length > 0) {
      let result;
      try {
        result = await opts.egressRunner(bodyText, {
          kind: "tool-call",
          id: `containment:${opts.label}:${dest.host}`,
          toolName: call?.tool,
        });
      } catch (err) {
        return refusal(
          "egress-pipeline-error",
          `egress pipeline failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (result.cancelled) {
        return refusal(
          "egress-pipeline-cancelled",
          `egress pipeline refused the request: ${result.reason}`,
        );
      }
      if (result.content !== bodyText) {
        if (encoded) {
          return refusal(
            "egress-pipeline-error",
            "egress pipeline rewrote a compressed body, which cannot be re-encoded faithfully",
          );
        }
        outBody = Buffer.from(result.content, "utf8");
      }
      if (result.delayMs > 0) {
        await new Promise((r) => setTimeout(r, Math.min(result.delayMs, MAX_PIPELINE_DELAY_MS)));
      }
    }

    // The choice-channel batcher holds real requests to their slot.
    const scheme = dest.mode === "http" ? "http" : "https";
    const defaultPort = dest.mode === "http" ? 80 : 443;
    const url = `${scheme}://${dest.host}${dest.port === defaultPort ? "" : `:${dest.port}`}${facts.target}`;
    if (call) {
      try {
        await requestToolIssueSlot(call.tool, url, call.callId);
      } catch {
        return refusal("batcher-slot-refused", "the egress batcher refused this request's slot");
      }
    }

    // Substitute handles.
    const substitute = (text: string) => {
      let out = text;
      for (const s of present) {
        const handle = opts.handles.get(s.id)!;
        const value = opts.secretValues.get(s.id);
        if (value !== undefined) {
          out = out.split(handle).join(value);
        }
      }
      return out;
    };
    if (present.length > 0 && !encoded) {
      // Byte-level, so a binary body (or WebSocket message) is never re-encoded.
      for (const s of present) {
        const value = opts.secretValues.get(s.id);
        if (value !== undefined) {
          outBody = replaceBytes(
            outBody,
            Buffer.from(opts.handles.get(s.id)!, "utf8"),
            Buffer.from(value, "utf8"),
          );
        }
      }
    }
    const headerPairs: Array<[string, string]> = [];
    for (const [k, v] of facts.headerPairs) {
      const name = k.toLowerCase();
      if (HOP_BY_HOP.has(name) || shaped.drop.has(name)) {
        continue;
      }
      const rewritten = shaped.rewrite.get(name);
      if (rewritten === null) {
        continue;
      }
      headerPairs.push([k, rewritten === undefined ? substitute(v) : rewritten]);
    }
    return {
      ok: true,
      body: outBody,
      headerPairs,
      target: substitute(facts.target),
      pin: facts.method === "GET" ? shaped.pin : null,
    };
  };

  const upstreamOf = (dest: ResolvedDestination): UpstreamTarget =>
    opts.upstream?.(dest.host, dest.port) ?? { host: dest.host, port: dest.port };

  const core: RelayCore = {
    opts,
    now,
    refuseEvent,
    bind,
    inspect,
    upstreamOf,
    callIds: () => [...calls.keys()],
  };

  const allowed = (
    dest: ResolvedDestination,
    protocol: "http/1.1" | "h2",
    where: { method: string; path: string },
    status: number | undefined,
    call: InFlightCall | null,
  ) =>
    opts.onEvent({
      type: "egress-allowed",
      host: dest.host,
      port: dest.port,
      mode: dest.mode,
      protocol,
      ...where,
      status,
      callIds: call ? [call.callId] : [],
      at: now(),
    });

  // ─── HTTP/1.1 ─────────────────────────────────────────────────────────

  const handleH1 = async (
    dest: ResolvedDestination,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    noBody = false,
  ): Promise<void> => {
    const method = req.method ?? "GET";
    const target = req.url ?? "/";
    const where = { method, path: target.split("?")[0] };
    const refuse = (r: Refusal) => {
      refuseEvent(r.code, dest.host, dest.port, r.message, where);
      if (!res.headersSent) {
        const body = JSON.stringify({
          error: "enclawed-containment",
          code: r.code,
          message: r.message,
        });
        res.writeHead(403, {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          "x-enclawed-refused": r.code,
          connection: "close",
        });
        res.end(body);
      } else {
        res.destroy();
      }
    };
    // The binding is taken when the request starts, before its body is read.
    const bound = bind(dest);
    if (!bound.ok) {
      refuse(bound);
      return;
    }
    if (hostOf(req.headers.host ?? "") !== dest.host) {
      refuse(
        refusal(
          "host-header-mismatch",
          `request Host "${req.headers.host ?? ""}" is not the destination ${dest.host}`,
        ),
      );
      return;
    }
    // An h2c upgrade offer carries no body (checked by the caller).
    const body = noBody ? Buffer.alloc(0) : await readBody(req);
    if (body === null) {
      refuse(
        refusal(
          "request-too-large",
          `request body larger than ${MAX_REQUEST_BODY} bytes cannot be inspected`,
        ),
      );
      return;
    }
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      pairs.push([req.rawHeaders[i], req.rawHeaders[i + 1]]);
    }
    const enc = req.headers["content-encoding"];
    const out = await inspect(
      dest,
      {
        method,
        target,
        authority: req.headers.host ?? "",
        headerPairs: pairs,
        headers: req.headers,
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
    const headers: Record<string, string | string[]> = {};
    for (const [k, v] of out.headerPairs) {
      const existing = headers[k];
      headers[k] =
        existing === undefined ? v : Array.isArray(existing) ? [...existing, v] : [existing, v];
    }
    headers.host = req.headers.host ?? dest.host;
    headers["content-length"] = String(out.body.length);
    const up = upstreamOf(dest);
    const client = dest.mode === "http" ? http : https;
    const upReq = client.request({
      host: up.host,
      port: up.port,
      method,
      path: out.target,
      headers,
      ...(dest.mode === "http"
        ? {}
        : { servername: dest.host, ALPNProtocols: ["http/1.1"], ...(up.ca ? { ca: up.ca } : {}) }),
      agent: false,
    });
    upReq.on("response", (upRes) => {
      if (out.pin) {
        // A pinned artifact: verified whole before the process sees a byte.
        void verifyPinnedAnswer(upRes, out.pin).then((v) => {
          if (!v.ok) {
            refuse(refusal(v.code, v.message));
            return;
          }
          res.writeHead(v.status, { ...v.headers, "content-length": String(v.size) });
          v.open().pipe(res);
          allowed(dest, "http/1.1", where, v.status, bound.call);
        });
        return;
      }
      const outHeaders: Record<string, string | string[]> = {};
      for (const [k, v] of Object.entries(upRes.headers)) {
        if (v !== undefined && !["connection", "keep-alive", "transfer-encoding"].includes(k)) {
          outHeaders[k] = v;
        }
      }
      res.writeHead(upRes.statusCode ?? 502, outHeaders);
      upRes.pipe(res);
      allowed(dest, "http/1.1", where, upRes.statusCode, bound.call);
    });
    upReq.on("error", (err) =>
      refuse(refusal("upstream-failed", `upstream ${dest.host}:${dest.port}: ${err.message}`)),
    );
    upReq.end(out.body);
  };

  const destOf = new WeakMap<object, ResolvedDestination>();
  /**
   * An HTTP/1.1 request with an Upgrade header: WebSocket goes through
   * ./relay-ws.ts; an h2c upgrade offer (curl --http2 on http://) is
   * declined the way RFC 9113 allows, by answering it as HTTP/1.1.
   */
  const upgradeOrRequest = (
    dest: ResolvedDestination,
    req: http.IncomingMessage,
    socket: net.Socket,
    head: Buffer,
  ) => {
    const upgrade = (req.headers.upgrade ?? "").toLowerCase();
    if (upgrade === "h2c" && !req.headers["content-length"] && !req.headers["transfer-encoding"]) {
      const res = new http.ServerResponse(req);
      res.assignSocket(socket);
      res.shouldKeepAlive = false;
      res.on("finish", () => socket.end());
      if (head.length > 0) {
        socket.unshift(head);
      }
      handleH1(dest, req, res, true).catch(() => socket.destroy());
      return;
    }
    serveWebSocket(core, dest, req, socket, head);
  };
  const httpServer = http.createServer((req, res) => {
    const dest = destOf.get(req.socket);
    if (!dest) {
      res.destroy();
      return;
    }
    handleH1(dest, req, res).catch((err: unknown) => {
      refuseEvent(
        "upstream-failed",
        dest.host,
        dest.port,
        `relay error: ${err instanceof Error ? err.message : String(err)}`,
      );
      res.destroy();
    });
  });
  httpServer.keepAliveTimeout = 5000;
  // HTTP/1.1 upgrades: WebSocket through the same checks; anything else refused.
  httpServer.on("upgrade", (req: http.IncomingMessage, socket: net.Socket, head: Buffer) => {
    const dest = destOf.get(req.socket) ?? destOf.get(socket);
    if (!dest) {
      socket.destroy();
      return;
    }
    upgradeOrRequest(dest, req, socket, head);
  });
  httpServer.on("connect", (req: http.IncomingMessage, socket: net.Socket) => {
    const dest = destOf.get(socket);
    refuseEvent(
      "upgrade-unsupported",
      dest?.host ?? null,
      dest?.port ?? 0,
      "CONNECT through an inspected destination is refused",
      {
        method: "CONNECT",
        path: req.url ?? "",
      },
    );
    socket.destroy();
  });

  // ─── HTTP/2 (./relay-h2.ts) ───────────────────────────────────────────

  const h2 = createH2Relay(core, allowed);
  const handleH2 = h2.handleH2;

  // One TLS server per destination (h2 and HTTP/1.1 on ALPN): every handler
  // knows its destination by closure. Node's h2 session cannot take over a
  // TLS socket terminated elsewhere, so the server terminates TLS itself.
  const secureServers = new Map<ResolvedDestination, http2.Http2SecureServer>();
  const secureServerFor = (dest: ResolvedDestination): http2.Http2SecureServer => {
    const have = secureServers.get(dest);
    if (have) {
      return have;
    }
    const leaf = opts.ca.leafFor(dest.host);
    const s = http2.createSecureServer({
      key: leaf.keyPem,
      cert: leaf.certPem,
      allowHTTP1: true,
      settings: { enablePush: false },
      SNICallback: (servername, cb) => {
        if (servername.toLowerCase() !== dest.host) {
          refuseEvent(
            "tls-name-mismatch",
            dest.host,
            dest.port,
            `TLS server name ${servername} is not ${dest.host}`,
          );
          cb(new Error("server name mismatch"));
          return;
        }
        cb(null, tls.createSecureContext({ key: leaf.keyPem, cert: leaf.certPem }));
      },
    });
    // HTTP/1.1 requests arrive as "request"; h2 streams as "stream" only
    // (the compatibility handler Node adds for "request" is removed, so an
    // h2 request is never handled twice).
    s.on(
      "request",
      (
        req: http.IncomingMessage | http2.Http2ServerRequest,
        res: http.ServerResponse | http2.Http2ServerResponse,
      ) => {
        if (req.httpVersionMajor >= 2) {
          return;
        }
        handleH1(dest, req as http.IncomingMessage, res as http.ServerResponse).catch(
          (err: unknown) => {
            refuseEvent(
              "upstream-failed",
              dest.host,
              dest.port,
              `relay error: ${err instanceof Error ? err.message : String(err)}`,
            );
            (res as http.ServerResponse).destroy();
          },
        );
      },
    );
    for (const l of s.listeners("stream")) {
      s.removeListener("stream", l as (...a: unknown[]) => void);
    }
    s.on("stream", (stream, hdrs, _flags, rawHeaders) => {
      handleH2(dest, stream as http2.ServerHttp2Stream, hdrs, rawHeaders).catch((err: unknown) => {
        refuseEvent(
          "upstream-failed",
          dest.host,
          dest.port,
          `relay error: ${err instanceof Error ? err.message : String(err)}`,
        );
        stream.destroy();
      });
    });
    s.on("upgrade", (req: http.IncomingMessage, socket: net.Socket, head: Buffer) =>
      upgradeOrRequest(dest, req, socket, head),
    );
    s.on("connect", (req: http.IncomingMessage, socket: net.Socket) => {
      refuseEvent(
        "upgrade-unsupported",
        dest.host,
        dest.port,
        "CONNECT through an inspected destination is refused",
        {
          method: "CONNECT",
          path: req.url ?? "",
        },
      );
      socket.destroy();
    });
    s.on("tlsClientError", (err: Error) => {
      refuseEvent(
        "tls-handshake-failed",
        dest.host,
        dest.port,
        `TLS with the contained process failed: ${err.message}`,
      );
    });
    s.on("sessionError", () => {});
    secureServers.set(dest, s);
    return s;
  };

  // ─── Connections ──────────────────────────────────────────────────────

  // Cleartext h2 (prior knowledge) for plain-HTTP destinations: one server per destination.
  const h2cServers = new Map<ResolvedDestination, http2.Http2Server>();
  const h2cServerFor = (dest: ResolvedDestination): http2.Http2Server => {
    let s = h2cServers.get(dest);
    if (!s) {
      s = http2.createServer({ settings: { enablePush: false } });
      s.on("stream", (stream, hdrs, _flags, rawHeaders) => {
        handleH2(dest, stream as http2.ServerHttp2Stream, hdrs, rawHeaders).catch(
          (err: unknown) => {
            refuseEvent(
              "upstream-failed",
              dest.host,
              dest.port,
              `relay error: ${err instanceof Error ? err.message : String(err)}`,
            );
            stream.destroy();
          },
        );
      });
      s.on("sessionError", () => {});
      h2cServers.set(dest, s);
    }
    return s;
  };

  const serveInspected = (sock: net.Socket, dest: ResolvedDestination) => {
    sock.write(Buffer.from([0x01]));
    if (dest.mode === "http") {
      // The first bytes tell h2c ("PRI * HTTP/2.0") from HTTP/1.1.
      sock.once("data", (first: Buffer) => {
        sock.pause();
        if (first.toString("latin1").startsWith("PRI ")) {
          // The h2 session reads from a stream that starts with the bytes
          // already read (a native socket handle would have lost them).
          const duplex = new Duplex({
            read() {
              sock.resume();
            },
            write(chunk: Buffer, _enc, cb) {
              sock.write(chunk, cb);
            },
            final(cb) {
              sock.end();
              cb();
            },
            destroy(err, cb) {
              sock.destroy();
              cb(err);
            },
          });
          duplex.push(first);
          sock.on("data", (c: Buffer) => {
            if (!duplex.push(c)) {
              sock.pause();
            }
          });
          sock.on("end", () => duplex.push(null));
          sock.on("close", () => duplex.destroy());
          h2cServerFor(dest).emit("connection", duplex);
          return;
        }
        sock.unshift(first);
        {
          destOf.set(sock, dest);
          httpServer.emit("connection", sock);
        }
        sock.resume();
      });
      sock.resume();
      return;
    }
    secureServerFor(dest).emit("connection", sock);
    sock.resume();
  };

  const end = (callId: string) => {
    calls.delete(callId);
    if (calls.size === 0) {
      queue.shift()?.();
    }
  };

  return {
    handle(sock) {
      sockets.add(sock);
      sock.on("close", () => sockets.delete(sock));
      sock.on("error", () => sock.destroy());
      let head = "";
      const onData = (chunk: Buffer) => {
        head += chunk.toString("latin1");
        const nl = head.indexOf("\n");
        if (nl < 0) {
          if (head.length > 4096) {
            sock.destroy();
          }
          return;
        }
        sock.removeListener("data", onData);
        sock.pause();
        let meta: { name: string | null; port: number };
        try {
          meta = JSON.parse(head.slice(0, nl)) as { name: string | null; port: number };
        } catch {
          sock.destroy();
          return;
        }
        if (!meta.name) {
          refuseEvent(
            "destination-unnamed",
            null,
            meta.port,
            `connection on port ${meta.port} to an address no looked-up name maps to`,
          );
          sock.destroy();
          return;
        }
        const dest = findDest(meta.name, meta.port);
        if (!dest) {
          refuseEvent(
            "destination-not-declared",
            meta.name,
            meta.port,
            `${meta.name}:${meta.port} is not a declared destination`,
          );
          sock.destroy();
          return;
        }
        if (dest.mode === "opaque") {
          serveOpaque(core, sock, dest);
        } else {
          serveInspected(sock, dest);
        }
      };
      sock.on("data", onData);
    },
    acquireCall(call) {
      return new Promise((resolve) => {
        const admit = () => {
          calls.set(call.callId, call);
          resolve(() => end(call.callId));
        };
        if (calls.size === 0 && queue.length === 0) {
          admit();
        } else {
          queue.push(admit);
        }
      });
    },
    beginCall(call) {
      calls.set(call.callId, call);
    },
    endCall(callId) {
      end(callId);
    },
    close() {
      for (const s of sockets) {
        s.destroy();
      }
      httpServer.close();
      for (const s of secureServers.values()) {
        s.close();
      }
      h2.close();
      for (const s of h2cServers.values()) {
        s.close();
      }
    },
  };
}
