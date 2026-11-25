// A small, strict DER reader for the attestation structures WebAuthn
// platform formats carry inside X.509 certificates: the Android key
// description, Apple's nonce extension, and a TPM attestation key
// certificate's subject alternative name, extended key usage and basic
// constraints. Definite lengths only, minimal length encodings only, every
// read bounded by its parent; anything else throws DerError.

export class DerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DerError";
  }
}

export const DER_CLASS = { universal: 0, application: 1, context: 2, private: 3 } as const;

export type Tlv = {
  cls: number;
  constructed: boolean;
  tag: number;
  /** Offset of the first content byte in `buf`. */
  start: number;
  /** Offset just past the last content byte. */
  end: number;
  buf: Uint8Array;
};

export function tlvContent(t: Tlv): Uint8Array {
  return t.buf.subarray(t.start, t.end);
}

/** Read one TLV at `at`, never past `limit`. */
export function readTlv(buf: Uint8Array, at = 0, limit = buf.length): Tlv {
  if (at >= limit) {
    throw new DerError("truncated: no tag");
  }
  const first = buf[at++];
  const cls = first >> 6;
  const constructed = (first & 0x20) !== 0;
  let tag = first & 0x1f;
  if (tag === 0x1f) {
    // High tag number form: base-128, minimal, at most 4 bytes.
    tag = 0;
    let n = 0;
    for (;;) {
      if (at >= limit) {
        throw new DerError("truncated tag");
      }
      const b = buf[at++];
      if (n === 0 && b === 0x80) {
        throw new DerError("non-minimal tag");
      }
      tag = tag * 128 + (b & 0x7f);
      n++;
      if (n > 4) {
        throw new DerError("tag too large");
      }
      if ((b & 0x80) === 0) {
        break;
      }
    }
    if (tag < 0x1f) {
      throw new DerError("non-minimal tag");
    }
  }
  if (at >= limit) {
    throw new DerError("truncated length");
  }
  let len = buf[at++];
  if (len === 0x80) {
    throw new DerError("indefinite length is not DER");
  }
  if (len > 0x80) {
    const n = len & 0x7f;
    if (n > 4 || at + n > limit) {
      throw new DerError("bad length");
    }
    len = 0;
    for (let i = 0; i < n; i++) {
      len = len * 256 + buf[at++];
    }
    if (len < 0x80 || (n > 1 && len < 256 ** (n - 1))) {
      throw new DerError("non-minimal length");
    }
  }
  if (at + len > limit) {
    throw new DerError("content runs past its parent");
  }
  return { cls, constructed, tag, start: at, end: at + len, buf };
}

/** Parse exactly one TLV filling `buf`. */
export function parseDer(buf: Uint8Array): Tlv {
  const t = readTlv(buf, 0, buf.length);
  if (t.end !== buf.length) {
    throw new DerError("trailing bytes");
  }
  return t;
}

/** The children of a constructed TLV, which must exactly fill it. */
export function children(t: Tlv): Tlv[] {
  if (!t.constructed) {
    throw new DerError("not a constructed value");
  }
  const out: Tlv[] = [];
  let at = t.start;
  while (at < t.end) {
    const c = readTlv(t.buf, at, t.end);
    out.push(c);
    at = c.end;
  }
  return out;
}

export function expect(t: Tlv, cls: number, tag: number, what: string): Tlv {
  if (t.cls !== cls || t.tag !== tag) {
    throw new DerError(`${what}: unexpected tag [${t.cls}:${t.tag}]`);
  }
  return t;
}

export const isSeq = (t: Tlv): boolean => t.cls === 0 && t.tag === 16 && t.constructed;
export const isSet = (t: Tlv): boolean => t.cls === 0 && t.tag === 17 && t.constructed;

export function seq(t: Tlv, what: string): Tlv[] {
  if (!isSeq(t)) {
    throw new DerError(`${what}: not a SEQUENCE`);
  }
  return children(t);
}

/** A non-negative INTEGER or ENUMERATED that fits a safe integer. */
export function readUint(t: Tlv, what: string): number {
  if (t.cls !== 0 || (t.tag !== 2 && t.tag !== 10) || t.constructed) {
    throw new DerError(`${what}: not an INTEGER`);
  }
  const c = tlvContent(t);
  if (c.length === 0 || (c[0] & 0x80) !== 0) {
    throw new DerError(`${what}: negative or empty INTEGER`);
  }
  if (c.length > 1 && c[0] === 0 && (c[1] & 0x80) === 0) {
    throw new DerError(`${what}: non-minimal INTEGER`);
  }
  let v = 0;
  for (const b of c) {
    v = v * 256 + b;
    if (v > Number.MAX_SAFE_INTEGER) {
      throw new DerError(`${what}: INTEGER too large`);
    }
  }
  return v;
}

export function readOctets(t: Tlv, what: string): Uint8Array {
  if (t.cls !== 0 || t.tag !== 4 || t.constructed) {
    throw new DerError(`${what}: not an OCTET STRING`);
  }
  return tlvContent(t);
}

export function readBoolean(t: Tlv, what: string): boolean {
  const c = tlvContent(t);
  if (t.cls !== 0 || t.tag !== 1 || t.constructed || c.length !== 1) {
    throw new DerError(`${what}: not a BOOLEAN`);
  }
  if (c[0] !== 0 && c[0] !== 0xff) {
    throw new DerError(`${what}: non-DER BOOLEAN`);
  }
  return c[0] === 0xff;
}

export function readOid(t: Tlv, what = "OID"): string {
  if (t.cls !== 0 || t.tag !== 6 || t.constructed) {
    throw new DerError(`${what}: not an OBJECT IDENTIFIER`);
  }
  const c = tlvContent(t);
  if (c.length === 0) {
    throw new DerError(`${what}: empty OID`);
  }
  const arcs: number[] = [];
  let v = 0;
  let fresh = true;
  for (const b of c) {
    if (fresh && b === 0x80) {
      throw new DerError(`${what}: non-minimal OID arc`);
    }
    fresh = false;
    v = v * 128 + (b & 0x7f);
    if (v > Number.MAX_SAFE_INTEGER) {
      throw new DerError(`${what}: OID arc too large`);
    }
    if ((b & 0x80) === 0) {
      arcs.push(v);
      v = 0;
      fresh = true;
    }
  }
  if (!fresh) {
    throw new DerError(`${what}: truncated OID`);
  }
  const head = arcs[0] < 80 ? [Math.floor(arcs[0] / 40), arcs[0] % 40] : [2, arcs[0] - 80];
  return [...head, ...arcs.slice(1)].join(".");
}

export type CertExtension = { oid: string; critical: boolean; value: Uint8Array };

/** The extensions of an X.509 v3 certificate, in order. Duplicate OIDs are an error (RFC 5280 §4.2). */
export function certExtensions(certDer: Uint8Array): CertExtension[] {
  const cert = seq(parseDer(certDer), "certificate");
  if (cert.length !== 3) {
    throw new DerError("certificate: expected tbsCertificate, algorithm, signature");
  }
  const tbs = seq(cert[0], "tbsCertificate");
  const wrapped = tbs.find((t) => t.cls === DER_CLASS.context && t.tag === 3);
  if (!wrapped) {
    return [];
  }
  const list = children(wrapped);
  if (list.length !== 1) {
    throw new DerError("extensions: expected one SEQUENCE");
  }
  const out: CertExtension[] = [];
  const seen = new Set<string>();
  for (const e of seq(list[0], "extensions")) {
    const parts = seq(e, "extension");
    const oid = readOid(parts[0], "extnID");
    let critical = false;
    let i = 1;
    if (parts.length === 3) {
      critical = readBoolean(parts[1], "critical");
      i = 2;
    } else if (parts.length !== 2) {
      throw new DerError("extension: wrong number of fields");
    }
    if (seen.has(oid)) {
      throw new DerError(`extension ${oid} appears twice`);
    }
    seen.add(oid);
    out.push({ oid, critical, value: readOctets(parts[i], "extnValue") });
  }
  return out;
}

/** The certificate's version field (0 = v1, 2 = v3). */
export function certVersion(certDer: Uint8Array): number {
  const tbs = seq(seq(parseDer(certDer), "certificate")[0], "tbsCertificate");
  const first = tbs[0];
  if (first.cls === DER_CLASS.context && first.tag === 0) {
    return readUint(children(first)[0], "version");
  }
  return 0;
}

/** True when the certificate's subject is the empty Name (a SEQUENCE with no RDNs). */
export function certSubjectEmpty(certDer: Uint8Array): boolean {
  const tbs = seq(seq(parseDer(certDer), "certificate")[0], "tbsCertificate");
  const off = tbs[0].cls === DER_CLASS.context && tbs[0].tag === 0 ? 1 : 0;
  // serial, signature, issuer, validity, subject
  const subject = tbs[off + 4];
  if (!subject || !isSeq(subject)) {
    throw new DerError("tbsCertificate: no subject");
  }
  return subject.end === subject.start;
}
