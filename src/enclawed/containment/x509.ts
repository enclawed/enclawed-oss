// Per-container certificate authority for the containment relay (M3).
//
// The relay terminates TLS for the destinations a contained process is
// allowed to reach, so it can apply the egress checks to the request
// itself. It presents a leaf certificate for the destination's name signed
// by a CA made for that one container. The CA certificate is written into
// the container's view as its only trust anchor; it is never installed in
// the host's trust store, and its private key never leaves the host
// process (it is not written anywhere).
//
// X.509 is built here with a minimal DER encoder (ECDSA P-256 with
// SHA-256), so no external tool or package is needed. Every certificate
// carries the extensions strict verifiers require (basic constraints,
// key usage, subject and authority key identifiers; the leaf also carries
// the server-auth extended key usage and the subject alternative name).

import crypto from "node:crypto";
import net from "node:net";

// ─── DER ────────────────────────────────────────────────────────────────

function derLength(n: number): Buffer {
  if (n < 0x80) {
    return Buffer.from([n]);
  }
  const bytes: number[] = [];
  let v = n;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v = Math.floor(v / 256);
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function tlv(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLength(content.length), content]);
}

const seq = (...items: Buffer[]) => tlv(0x30, Buffer.concat(items));
const set = (...items: Buffer[]) => tlv(0x31, Buffer.concat(items));
const octets = (b: Buffer) => tlv(0x04, b);
const bitString = (b: Buffer, unused = 0) => tlv(0x03, Buffer.concat([Buffer.from([unused]), b]));
const utf8 = (s: string) => tlv(0x0c, Buffer.from(s, "utf8"));
const boolTrue = () => tlv(0x01, Buffer.from([0xff]));
const explicit = (n: number, content: Buffer) => tlv(0xa0 + n, content);

function derInteger(b: Buffer): Buffer {
  let i = 0;
  while (i < b.length - 1 && b[i] === 0) {
    i++;
  }
  let v = b.subarray(i);
  if (v[0] & 0x80) {
    v = Buffer.concat([Buffer.from([0]), v]);
  }
  return tlv(0x02, v);
}

function oid(dotted: string): Buffer {
  const parts = dotted.split(".").map(Number);
  const out: number[] = [40 * parts[0] + parts[1]];
  for (const p of parts.slice(2)) {
    const stack: number[] = [p & 0x7f];
    let v = Math.floor(p / 128);
    while (v > 0) {
      stack.unshift((v & 0x7f) | 0x80);
      v = Math.floor(v / 128);
    }
    out.push(...stack);
  }
  return tlv(0x06, Buffer.from(out));
}

function derTime(d: Date): Buffer {
  const iso = d.toISOString().replace(/[-:T]/g, "").slice(0, 14); // YYYYMMDDHHMMSS
  const y = d.getUTCFullYear();
  return y >= 1950 && y < 2050
    ? tlv(0x17, Buffer.from(`${iso.slice(2)}Z`))
    : tlv(0x18, Buffer.from(`${iso}Z`));
}

const OID = {
  ecdsaWithSha256: "1.2.840.10045.4.3.2",
  commonName: "2.5.4.3",
  organization: "2.5.4.10",
  basicConstraints: "2.5.29.19",
  keyUsage: "2.5.29.15",
  extKeyUsage: "2.5.29.37",
  serverAuth: "1.3.6.1.5.5.7.3.1",
  subjectAltName: "2.5.29.17",
  subjectKeyId: "2.5.29.14",
  authorityKeyId: "2.5.29.35",
  nameConstraints: "2.5.29.30",
};

/** A name no destination can have (RFC 6761): the permitted subtree of a CA with no destinations. */
const NO_NAME = "enclawed-no-destination.invalid";

/** NameConstraints: permitted = the declared DNS names; excluded = all IPv4 and IPv6 addresses. */
function nameConstraints(names: readonly string[]): Buffer {
  const permitted = (names.length > 0 ? names : [NO_NAME]).map((n) =>
    // GeneralSubtree { base GeneralName } with dNSName [2].
    seq(tlv(0x82, Buffer.from(n, "ascii"))),
  );
  const excluded = [
    seq(tlv(0x87, Buffer.alloc(8))), // 0.0.0.0/0
    seq(tlv(0x87, Buffer.alloc(32))), // ::/0
  ];
  return seq(tlv(0xa0, Buffer.concat(permitted)), tlv(0xa1, Buffer.concat(excluded)));
}

function name(cn: string): Buffer {
  return seq(
    set(seq(oid(OID.organization), utf8("Enclawed containment"))),
    set(seq(oid(OID.commonName), utf8(cn))),
  );
}

function extension(id: string, critical: boolean, value: Buffer): Buffer {
  return seq(oid(id), ...(critical ? [boolTrue()] : []), octets(value));
}

function keyId(spkiDer: Buffer): Buffer {
  return crypto.createHash("sha256").update(spkiDer).digest().subarray(0, 20);
}

function pem(label: string, der: Buffer): string {
  const b64 = der.toString("base64").replace(/(.{64})/g, "$1\n");
  return `-----BEGIN ${label}-----\n${b64}${b64.endsWith("\n") ? "" : "\n"}-----END ${label}-----\n`;
}

type CertInput = {
  subject: string;
  issuer: string;
  subjectKey: crypto.KeyObject;
  issuerKey: crypto.KeyObject;
  issuerSpki: Buffer;
  ca: boolean;
  /** CA only: the DNS names its leaves may carry. */
  permittedNames?: readonly string[];
  altName?: string;
  notBefore: Date;
  notAfter: Date;
};

function buildCertificate(input: CertInput): Buffer {
  const spki = input.subjectKey.export({ type: "spki", format: "der" });
  const serial = crypto.randomBytes(16);
  serial[0] &= 0x7f;
  serial[0] |= 0x01;
  const sigAlg = seq(oid(OID.ecdsaWithSha256));
  const exts: Buffer[] = [];
  if (input.ca) {
    exts.push(extension(OID.basicConstraints, true, seq(boolTrue(), derInteger(Buffer.from([0])))));
    // keyCertSign (bit 5) + cRLSign (bit 6): 0b00000110, one unused bit.
    exts.push(extension(OID.keyUsage, true, bitString(Buffer.from([0x06]), 1)));
    if (input.permittedNames) {
      exts.push(extension(OID.nameConstraints, true, nameConstraints(input.permittedNames)));
    }
  } else {
    exts.push(extension(OID.basicConstraints, true, seq()));
    // digitalSignature (bit 0): 0b10000000, seven unused bits.
    exts.push(extension(OID.keyUsage, true, bitString(Buffer.from([0x80]), 7)));
    exts.push(extension(OID.extKeyUsage, false, seq(oid(OID.serverAuth))));
    const alt = input.altName ?? input.subject;
    const ipFamily = net.isIP(alt);
    const general =
      ipFamily === 4
        ? tlv(0x87, Buffer.from(alt.split(".").map(Number)))
        : ipFamily === 6
          ? tlv(0x87, ipv6Bytes(alt))
          : tlv(0x82, Buffer.from(alt, "ascii"));
    exts.push(extension(OID.subjectAltName, false, seq(general)));
  }
  exts.push(extension(OID.subjectKeyId, false, octets(keyId(spki))));
  exts.push(extension(OID.authorityKeyId, false, seq(tlv(0x80, keyId(input.issuerSpki)))));
  const tbs = seq(
    explicit(0, derInteger(Buffer.from([2]))),
    derInteger(serial),
    sigAlg,
    name(input.issuer),
    seq(derTime(input.notBefore), derTime(input.notAfter)),
    name(input.subject),
    spki,
    explicit(3, seq(...exts)),
  );
  const signature = crypto.sign("sha256", tbs, input.issuerKey);
  return seq(tbs, sigAlg, bitString(signature));
}

function ipv6Bytes(ip: string): Buffer {
  const u = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const [head, tail] = u.includes("::") ? u.split("::") : [u, ""];
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = [...h, ...Array(8 - h.length - t.length).fill("0"), ...t];
  return Buffer.concat(groups.map((g) => Buffer.from(g.padStart(4, "0"), "hex")));
}

const LIFETIME_MS = 30 * 24 * 3600 * 1000;
const BACKDATE_MS = 3600 * 1000;

export type ContainerCa = {
  /** PEM of the CA certificate: the only trust anchor inside the container. */
  readonly certPem: string;
  /** The DNS names the CA is constrained to (the declared destinations). */
  readonly names: readonly string[];
  /** A TLS key and certificate for `hostname`, signed by this CA (cached per name); throws for an undeclared name. */
  leafFor(hostname: string): { keyPem: string; certPem: string };
};

const DNS_NAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

/**
 * Make a fresh CA for one container, constrained to `names` (the declared
 * destinations). Its private key exists only in this object.
 */
export function createContainerCa(
  label: string,
  names: readonly string[],
  now: Date = new Date(),
): ContainerCa {
  return makeCa(label, names, now).ca;
}

/**
 * Tests only: the same CA together with its private key, so a test can sign
 * a leaf outside the constraints and prove a verifier rejects it. Production
 * code uses createContainerCa, which never exposes the key.
 */
export function createContainerCaWithKeyForTest(
  label: string,
  names: readonly string[],
): { ca: ContainerCa; signLeaf: (hostname: string) => { keyPem: string; certPem: string } } {
  const m = makeCa(label, names, new Date());
  return { ca: m.ca, signLeaf: m.sign };
}

function makeCa(
  label: string,
  rawNames: readonly string[],
  now: Date,
): { ca: ContainerCa; sign: (hostname: string) => { keyPem: string; certPem: string } } {
  const names = [...new Set(rawNames.map((n) => n.toLowerCase()))].toSorted();
  for (const n of names) {
    if (!DNS_NAME.test(n)) {
      throw new Error(`enclawed containment CA: not a DNS name: ${n}`);
    }
  }
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const caSpki = publicKey.export({ type: "spki", format: "der" });
  const subject = `Enclawed containment CA (${label.slice(0, 40)})`;
  const notBefore = new Date(now.getTime() - BACKDATE_MS);
  const notAfter = new Date(now.getTime() + LIFETIME_MS);
  const caDer = buildCertificate({
    subject,
    issuer: subject,
    subjectKey: publicKey,
    issuerKey: privateKey,
    issuerSpki: caSpki,
    ca: true,
    permittedNames: names,
    notBefore,
    notAfter,
  });
  const leaves = new Map<string, { keyPem: string; certPem: string }>();
  const sign = (hostname: string) => {
    const host = hostname.toLowerCase();
    const leaf = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const der = buildCertificate({
      subject: host,
      issuer: subject,
      subjectKey: leaf.publicKey,
      issuerKey: privateKey,
      issuerSpki: caSpki,
      ca: false,
      altName: host,
      notBefore,
      notAfter,
    });
    return {
      keyPem: leaf.privateKey.export({ type: "pkcs8", format: "pem" }),
      certPem: pem("CERTIFICATE", der),
    };
  };
  const ca: ContainerCa = {
    certPem: pem("CERTIFICATE", caDer),
    names,
    leafFor(hostname) {
      const host = hostname.toLowerCase();
      if (!names.includes(host)) {
        throw new Error(`enclawed containment CA: ${host} is not a declared destination`);
      }
      const cached = leaves.get(host);
      if (cached) {
        return cached;
      }
      const out = sign(host);
      leaves.set(host, out);
      return out;
    },
  };
  return { ca, sign };
}
