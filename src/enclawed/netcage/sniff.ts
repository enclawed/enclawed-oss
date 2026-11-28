// Readers for the first bytes a caged process sends when it tries to reach
// the network: the DNS question it asks, the TLS server name it dials, or
// the HTTP request line and Host header. They turn a trapped attempt into an
// alert a person can read ("tried to upload to bucket.oss-cn-hangzhou...").
//
// Every reader takes untrusted bytes and must never throw: a malformed or
// hostile payload yields null, not an exception that could kill the trap.

const MAX_NAME = 253;

/**
 * The first question name of a DNS query, or null. Case is kept: DNS
 * matching ignores it, but encoded exfiltration (base64 labels) uses it.
 */
export function parseDnsQuestion(buf: Uint8Array): { name: string; type: number } | null {
  try {
    if (buf.length < 12) {
      return null;
    }
    const qdcount = (buf[4] << 8) | buf[5];
    if (qdcount < 1) {
      return null;
    }
    const labels: string[] = [];
    let off = 12;
    let total = 0;
    for (;;) {
      if (off >= buf.length) {
        return null;
      }
      const len = buf[off];
      if (len === 0) {
        off += 1;
        break;
      }
      // A query has no compression pointers; anything above 63 is malformed.
      if (len > 63 || off + 1 + len > buf.length) {
        return null;
      }
      total += len + 1;
      if (total > MAX_NAME + 1) {
        return null;
      }
      labels.push(Buffer.from(buf.subarray(off + 1, off + 1 + len)).toString("latin1"));
      off += 1 + len;
    }
    if (off + 4 > buf.length || labels.length === 0) {
      return null;
    }
    return { name: labels.join("."), type: (buf[off] << 8) | buf[off + 1] };
  } catch {
    return null;
  }
}

/**
 * A DNS answer for `query` that points the name at `sinkhole` (IPv4), so the
 * caller's follow-up connection lands on the trap too and shows what it
 * meant to send. Non-A questions get an empty NOERROR answer.
 */
export function dnsSinkholeAnswer(query: Uint8Array, sinkhole: string): Buffer | null {
  const q = parseDnsQuestion(query);
  if (!q) {
    return null;
  }
  // Header + the single question, copied from the query.
  let end = 12;
  while (query[end] !== 0) {
    end += 1 + query[end];
  }
  end += 5;
  const head = Buffer.from(query.subarray(0, end));
  head[2] = 0x81; // QR=1, opcode 0, RD copied as set
  head[3] = 0x80; // RA=1, RCODE 0
  head.writeUInt16BE(1, 4); // QDCOUNT
  head.writeUInt16BE(0, 8); // NSCOUNT
  head.writeUInt16BE(0, 10); // ARCOUNT
  const octets = sinkhole.split(".").map(Number);
  if (q.type !== 1 || octets.length !== 4 || octets.some((o) => !(o >= 0 && o <= 255))) {
    head.writeUInt16BE(0, 6);
    return head;
  }
  head.writeUInt16BE(1, 6); // ANCOUNT
  const answer = Buffer.from([0xc0, 0x0c, 0, 1, 0, 1, 0, 0, 0, 30, 0, 4, ...octets]);
  return Buffer.concat([head, answer]);
}

/** The server name (SNI) of a TLS ClientHello, or null. */
export function parseTlsSni(buf: Uint8Array): string | null {
  try {
    // Record: type 22 (handshake), then a ClientHello (type 1).
    if (buf.length < 43 || buf[0] !== 22 || buf[5] !== 1) {
      return null;
    }
    let off = 9 + 2 + 32; // handshake header, client version, random
    const sid = buf[off];
    off += 1 + sid;
    if (off + 2 > buf.length) {
      return null;
    }
    const suites = (buf[off] << 8) | buf[off + 1];
    off += 2 + suites;
    if (off + 1 > buf.length) {
      return null;
    }
    off += 1 + buf[off]; // compression methods
    if (off + 2 > buf.length) {
      return null;
    }
    const extEnd = Math.min(buf.length, off + 2 + ((buf[off] << 8) | buf[off + 1]));
    off += 2;
    while (off + 4 <= extEnd) {
      const type = (buf[off] << 8) | buf[off + 1];
      const len = (buf[off + 2] << 8) | buf[off + 3];
      off += 4;
      if (type === 0 && off + 5 <= extEnd) {
        // server_name list: list length, name type (0 = host), name length.
        const nameLen = (buf[off + 3] << 8) | buf[off + 4];
        if (buf[off + 2] !== 0 || nameLen > MAX_NAME || off + 5 + nameLen > extEnd) {
          return null;
        }
        return Buffer.from(buf.subarray(off + 5, off + 5 + nameLen))
          .toString("latin1")
          .toLowerCase();
      }
      off += len;
    }
    return null;
  } catch {
    return null;
  }
}

const HTTP_METHODS =
  /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|CONNECT|TRACE) (\S{1,2048}) HTTP\/1\.[01]$/;

/** The request line and Host header of a plain HTTP/1.x request, or null. */
export function parseHttpRequestHead(
  buf: Uint8Array,
): { method: string; target: string; host: string | null } | null {
  try {
    const text = Buffer.from(buf.subarray(0, 8192)).toString("latin1");
    const lines = text.split("\r\n");
    const m = HTTP_METHODS.exec(lines[0] ?? "");
    if (!m) {
      return null;
    }
    let host: string | null = null;
    for (const line of lines.slice(1)) {
      if (line === "") {
        break;
      }
      const h = /^host:\s*(\S{1,300})\s*$/i.exec(line);
      if (h) {
        host = h[1].toLowerCase();
        break;
      }
    }
    return { method: m[1], target: m[2], host };
  } catch {
    return null;
  }
}

export type CaptureSummary = {
  /** What the bytes are: dns, tls, http, or unknown. */
  protocol: "dns" | "tls" | "http" | "unknown";
  /** The name the process tried to reach, when the bytes reveal it. */
  name: string | null;
  /** HTTP method and target, for plain HTTP. */
  request: string | null;
};

/** Classify the first bytes of a trapped attempt. */
export function summarizeCapture(
  buf: Uint8Array,
  transport: "tcp" | "udp",
  port: number,
): CaptureSummary {
  if (port === 53 || port === 5353) {
    // DNS over TCP carries a two-byte length prefix.
    const dns = parseDnsQuestion(transport === "tcp" ? buf.subarray(2) : buf);
    if (dns) {
      return { protocol: "dns", name: dns.name, request: null };
    }
  }
  const sni = parseTlsSni(buf);
  if (sni !== null) {
    return { protocol: "tls", name: sni, request: null };
  }
  const http = parseHttpRequestHead(buf);
  if (http) {
    return { protocol: "http", name: http.host, request: `${http.method} ${http.target}` };
  }
  const dns = parseDnsQuestion(buf);
  if (transport === "udp" && dns) {
    return { protocol: "dns", name: dns.name, request: null };
  }
  return { protocol: "unknown", name: null, request: null };
}
