// Types and small helpers shared by the relay's transports (./relay.ts,
// ./relay-ws.ts, ./relay-opaque.ts). No I/O.

import type net from "node:net";
import type { EgressRunner } from "@enclawed/egress-core";
import type { ContainmentSecret, ResolvedDestination } from "./plan.js";
import type { ArtifactDigest, ShapeRefusalCode } from "./request-shape.js";
import type { ContainerCa } from "./x509.js";

export type RelayRefusalCode =
  | "destination-not-declared"
  | "destination-unnamed"
  | "tls-name-mismatch"
  | "tls-handshake-failed"
  | "host-header-mismatch"
  | "no-call-in-flight"
  | "call-ambiguous"
  | "request-too-large"
  | "request-encoding-unsupported"
  | "secret-handle-wrong-destination"
  | "secret-handle-in-encoded-body"
  | "secret-in-request"
  | "routing-field-not-from-call"
  | "routing-body-unparseable"
  | "egress-pipeline-cancelled"
  | "egress-pipeline-error"
  | "batcher-slot-refused"
  | "upgrade-unsupported"
  | "websocket-protocol-error"
  | "websocket-extension-refused"
  | "opaque-tls-name-mismatch"
  | "opaque-tls-unreadable"
  | ShapeRefusalCode
  | "upstream-failed";

export type RelayEvent =
  | Readonly<{
      type: "egress-refused";
      code: RelayRefusalCode;
      host: string | null;
      port: number;
      method?: string;
      path?: string;
      callIds: readonly string[];
      message: string;
      at: string;
    }>
  | Readonly<{
      type: "egress-allowed";
      host: string;
      port: number;
      mode: ResolvedDestination["mode"];
      protocol?: "http/1.1" | "h2" | "websocket";
      method?: string;
      path?: string;
      status?: number;
      callIds: readonly string[];
      at: string;
    }>;

export type InFlightCall = Readonly<{ callId: string; tool: string; arguments: unknown }>;

export type UpstreamTarget = Readonly<{ host: string; port: number; ca?: string | Buffer }>;

export type RelayOptions = Readonly<{
  label: string;
  destinations: readonly ResolvedDestination[];
  ca: ContainerCa;
  secrets: readonly ContainmentSecret[];
  /** Secret id -> value, held by the host process only. */
  secretValues: ReadonlyMap<string, string>;
  /** Secret id -> handle the process sees. */
  handles: ReadonlyMap<string, string>;
  /** Enclawed's egress pipeline for outbound request bodies; none: no stages run. */
  egressRunner?: EgressRunner | null;
  /** Where to connect for a destination (default: the name and port themselves, system trust). */
  upstream?: (host: string, port: number) => UpstreamTarget;
  /** Test seam: the clock of the generic destinations' capacity ledgers (ms). */
  ledgerClock?: () => number;
  onEvent: (event: RelayEvent) => void;
}>;

/** Largest request body (or WebSocket message) the relay reads, and so can inspect; larger is refused. */
export const MAX_REQUEST_BODY = 16 * 1024 * 1024;
export type EgressRelay = {
  /** A connection from the containment's relay socket. */
  handle(sock: net.Socket): void;
  /** Wait until no other call is in flight, then put `call` in flight; the returned function ends it. */
  acquireCall(call: InFlightCall): Promise<() => void>;
  /** Put a call in flight at once (a second concurrent call makes requests ambiguous: refused). */
  beginCall(call: InFlightCall): void;
  endCall(callId: string): void;
  close(): void;
};

export type Refusal = Readonly<{ ok: false; code: RelayRefusalCode; message: string }>;

/** What the transport read of one request; the checks are the same for every protocol. */
export type RequestFacts = Readonly<{
  method: string;
  /** Path and query. */
  target: string;
  /** Host header (HTTP/1.1) or :authority (h2). */
  authority: string;
  /** Header name/value pairs as sent, without pseudo-headers. */
  headerPairs: ReadonlyArray<readonly [string, string]>;
  headers: Readonly<Record<string, string | string[] | undefined>>;
  body: Buffer;
  /** Content-Encoding of `body` (a WebSocket message has none). */
  contentEncoding?: string;
}>;

export type Inspected = Readonly<{
  ok: true;
  body: Buffer;
  headerPairs: Array<[string, string]>;
  target: string;
  /**
   * A shaped destination's pinned artifact (./request-shape.ts): the answer
   * is verified against these digests before any byte reaches the process.
   */
  pin: readonly ArtifactDigest[] | null;
}>;

/** The shared decision procedure, used by every transport (./relay-ws.ts, ./relay-opaque.ts). */
export type RelayCore = {
  readonly opts: RelayOptions;
  now(): string;
  refuseEvent(
    code: RelayRefusalCode,
    host: string | null,
    port: number,
    message: string,
    extra?: { method?: string; path?: string },
  ): void;
  bind(dest: ResolvedDestination): Readonly<{ ok: true; call: InFlightCall | null }> | Refusal;
  inspect(
    dest: ResolvedDestination,
    facts: RequestFacts,
    call: InFlightCall | null,
    kind: "request" | "message",
  ): Promise<Inspected | Refusal>;
  upstreamOf(dest: ResolvedDestination): UpstreamTarget;
  callIds(): string[];
};

/** Every occurrence of `from` in `buf` replaced by `to`. */
export function replaceBytes(buf: Buffer, from: Buffer, to: Buffer): Buffer {
  const parts: Buffer[] = [];
  let at = 0;
  for (let i = buf.indexOf(from, at); i >= 0; i = buf.indexOf(from, at)) {
    parts.push(buf.subarray(at, i), to);
    at = i + from.length;
  }
  if (parts.length === 0) {
    return buf;
  }
  parts.push(buf.subarray(at));
  return Buffer.concat(parts);
}

export const refusal = (code: RelayRefusalCode, message: string): Refusal => ({
  ok: false,
  code,
  message,
});

/** Headers that describe one hop, never forwarded as they are. */
export const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  "proxy-authorization",
  "proxy-authenticate",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "host",
  "http2-settings",
]);

export function hostOf(authority: string): string {
  const a = authority.toLowerCase().trim();
  if (a.startsWith("[")) {
    return a.slice(1, a.indexOf("]"));
  }
  return a.replace(/:\d+$/, "");
}

/** Read a request body, bounded; null when it exceeds MAX_REQUEST_BODY. */
export function readBody(
  stream: NodeJS.ReadableStream & { destroy(): void },
): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const finish = (v: Buffer | null) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    stream.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_REQUEST_BODY) {
        stream.destroy();
        finish(null);
        return;
      }
      chunks.push(c);
    });
    stream.on("end", () => finish(Buffer.concat(chunks)));
    stream.on("error", () => finish(Buffer.concat(chunks)));
    stream.on("close", () => finish(Buffer.concat(chunks)));
  });
}
