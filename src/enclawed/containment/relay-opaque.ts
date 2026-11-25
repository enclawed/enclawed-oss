// Opaque destinations through the containment relay (M3).
//
// An opaque destination is passed through unread: the relay cannot see the
// payload because the contained process speaks end-to-end TLS with keys the
// relay does not hold (a pinned client certificate, certificate pinning) or
// a protocol that is not HTTP. What can be decided without the plaintext is
// decided, and nothing else is claimed:
//
//   1. destination: the relay picks the address (the declared name and
//      port); the process cannot redirect the connection;
//   2. call binding: the connection opens only while exactly one call is in
//      flight, or for a declared background destination;
//   3. TLS: the ClientHello must name the declared host (SNI), so a shared
//      front (a CDN address) cannot be used to reach another tenant (domain
//      fronting), and must not carry an encrypted ClientHello (whose inner
//      name the relay could not check). A STARTTLS upgrade later in a
//      cleartext stream is checked the same way;
//   4. cleartext: every client byte is scanned before it is forwarded for
//      structured credentials and the values of declared secrets (a held
//      window covers a value split across reads), so a credential never
//      leaves whole.
//
// Why this is the limit for TLS: after the handshake the records are
// encrypted with keys negotiated end to end, and from TLS 1.3 on even the
// server's certificate is encrypted, so the relay can neither read the
// requests nor verify which certificate the server presented. Inspecting
// more means terminating TLS, which is what mode "inspect" does. The record
// says the payload is not inspected; secrets cannot be declared for an
// opaque destination (./plan.ts).

import net from "node:net";
import { credentialFindings, type ResolvedDestination } from "./plan.js";
import { refusal, type RelayCore } from "./relay-types.js";

const MAX_CLIENT_HELLO = 64 * 1024;
const EXT_SERVER_NAME = 0x0000;
const EXT_ECH = 0xfe0d;
/** Bytes of the previous read kept for the DLP scan of the next one. */
const DLP_OVERLAP = 4096;

export type ClientHelloVerdict =
  | Readonly<{ state: "need-more" }>
  | Readonly<{ state: "not-tls" }>
  | Readonly<{ state: "hello"; serverName: string | null; ech: boolean; length: number }>
  | Readonly<{ state: "malformed"; why: string }>;

/** Read a TLS ClientHello from the start of `buf` (possibly spread over several records). */
export function readClientHello(buf: Buffer): ClientHelloVerdict {
  if (buf.length === 0) {
    return { state: "need-more" };
  }
  if (buf[0] !== 0x16) {
    return { state: "not-tls" };
  }
  // Reassemble the handshake message from consecutive handshake records.
  const hs: Buffer[] = [];
  let off = 0;
  let have = 0;
  let need = -1;
  while (need < 0 || have < need) {
    if (buf.length < off + 5) {
      return buf.length > MAX_CLIENT_HELLO
        ? { state: "malformed", why: "ClientHello too large" }
        : { state: "need-more" };
    }
    if (buf[off] !== 0x16 || buf[off + 1] !== 0x03) {
      return { state: "malformed", why: "not a TLS handshake record" };
    }
    const recLen = buf.readUInt16BE(off + 3);
    if (recLen === 0 || recLen > 16384 + 256) {
      return { state: "malformed", why: "bad TLS record length" };
    }
    if (buf.length < off + 5 + recLen) {
      return { state: "need-more" };
    }
    hs.push(buf.subarray(off + 5, off + 5 + recLen));
    have += recLen;
    off += 5 + recLen;
    if (need < 0) {
      const first = Buffer.concat(hs);
      if (first.length < 4) {
        continue;
      }
      if (first[0] !== 0x01) {
        return { state: "malformed", why: "first handshake message is not a ClientHello" };
      }
      need = 4 + first.readUIntBE(1, 3);
      if (need > MAX_CLIENT_HELLO) {
        return { state: "malformed", why: "ClientHello too large" };
      }
    }
  }
  const m = Buffer.concat(hs).subarray(4, need);
  try {
    let p = 2 + 32; // version, random
    p += 1 + m[p]; // session id
    p += 2 + m.readUInt16BE(p); // cipher suites
    p += 1 + m[p]; // compression methods
    if (p === m.length) {
      return { state: "hello", serverName: null, ech: false, length: off };
    }
    const extEnd = p + 2 + m.readUInt16BE(p);
    p += 2;
    let serverName: string | null = null;
    let ech = false;
    while (p + 4 <= extEnd) {
      const type = m.readUInt16BE(p);
      const len = m.readUInt16BE(p + 2);
      const data = m.subarray(p + 4, p + 4 + len);
      if (data.length !== len) {
        return { state: "malformed", why: "truncated extension" };
      }
      if (type === EXT_ECH) {
        ech = true;
      } else if (type === EXT_SERVER_NAME) {
        let q = 2;
        const listEnd = 2 + data.readUInt16BE(0);
        while (q + 3 <= listEnd) {
          const nameType = data[q];
          const nameLen = data.readUInt16BE(q + 1);
          const name = data.subarray(q + 3, q + 3 + nameLen);
          if (nameType === 0) {
            if (serverName !== null || !/^[\x21-\x7e]+$/.test(name.toString("latin1"))) {
              return { state: "malformed", why: "bad or repeated server name" };
            }
            serverName = name.toString("ascii").toLowerCase();
          }
          q += 3 + nameLen;
        }
      }
      p += 4 + len;
    }
    return { state: "hello", serverName, ech, length: off };
  } catch {
    return { state: "malformed", why: "unreadable ClientHello" };
  }
}

const looksLikeClientHello = (b: Buffer) =>
  b.length >= 3 && b[0] === 0x16 && b[1] === 0x03 && b[2] >= 0x01 && b[2] <= 0x04;

export function serveOpaque(core: RelayCore, sock: net.Socket, dest: ResolvedDestination): void {
  const bound = core.bind(dest);
  if (!bound.ok) {
    core.refuseEvent(bound.code, dest.host, dest.port, bound.message);
    sock.destroy();
    return;
  }
  const up = core.upstreamOf(dest);
  const upstream = net.connect(up.port, up.host);
  let done = false;
  const close = () => {
    done = true;
    sock.destroy();
    upstream.destroy();
  };
  const refuse = (code: Parameters<typeof refusal>[0], message: string) => {
    if (!done) {
      core.refuseEvent(code, dest.host, dest.port, message);
    }
    close();
  };
  upstream.on("error", (err) => refuse("upstream-failed", err.message));
  sock.on("error", close);
  sock.on("close", close);
  upstream.on("close", close);
  upstream.once("connect", () => {
    core.opts.onEvent({
      type: "egress-allowed",
      host: dest.host,
      port: dest.port,
      mode: "opaque",
      callIds: bound.call ? [bound.call.callId] : [],
      at: core.now(),
    });
    sock.write(Buffer.from([0x01]));
    upstream.pipe(sock);

    // Client to server: "start" (first bytes decide), "hello" (collecting a
    // ClientHello), "clear" (scanned cleartext), "tls" (passed through).
    let mode: "start" | "hello" | "clear" | "tls" = "start";
    let pending: Buffer = Buffer.alloc(0);
    let window = "";
    const secretValues = [...core.opts.secretValues.entries()].filter(([, v]) => v.length >= 8);
    const scanClear = (chunk: Buffer): boolean => {
      const text = window + chunk.toString("latin1");
      const found = credentialFindings(text);
      if (found.length > 0) {
        refuse(
          "secret-in-request",
          `the stream to ${dest.host}:${dest.port} carries a credential (${found.join(", ")})`,
        );
        return false;
      }
      for (const [id, v] of secretValues) {
        if (text.includes(v)) {
          refuse(
            "secret-in-request",
            `the stream to ${dest.host}:${dest.port} carries the value of secret ${id}`,
          );
          return false;
        }
      }
      window = text.slice(-DLP_OVERLAP);
      return true;
    };
    const onHello = (): void => {
      const v = readClientHello(pending);
      if (v.state === "need-more") {
        return;
      }
      if (v.state !== "hello") {
        refuse(
          "opaque-tls-unreadable",
          `TLS handshake to ${dest.host}:${dest.port} could not be read: ${v.state === "malformed" ? v.why : "not TLS"}`,
        );
        return;
      }
      if (v.ech) {
        refuse(
          "opaque-tls-name-mismatch",
          `TLS to ${dest.host}:${dest.port} uses an encrypted ClientHello, whose server name cannot be checked`,
        );
        return;
      }
      if (v.serverName !== dest.host) {
        refuse(
          "opaque-tls-name-mismatch",
          `TLS to ${dest.host}:${dest.port} names ${v.serverName ?? "no server"}; only ${dest.host} may be reached there`,
        );
        return;
      }
      mode = "tls";
      upstream.write(pending);
      pending = Buffer.alloc(0);
    };
    sock.on("data", (chunk: Buffer) => {
      if (done) {
        return;
      }
      if (mode === "tls") {
        upstream.write(chunk);
        return;
      }
      if (mode === "hello") {
        pending = Buffer.concat([pending, chunk]);
        onHello();
        return;
      }
      if (mode === "start" && chunk[0] === 0x16) {
        mode = "hello";
        pending = chunk;
        onHello();
        return;
      }
      mode = "clear";
      // A STARTTLS upgrade: the ClientHello starts a read of its own.
      if (looksLikeClientHello(chunk)) {
        mode = "hello";
        pending = chunk;
        onHello();
        return;
      }
      if (scanClear(chunk)) {
        upstream.write(chunk);
      }
    });
    sock.resume();
  });
}
