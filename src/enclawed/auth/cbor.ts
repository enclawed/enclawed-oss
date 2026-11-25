// A strict, minimal CBOR (RFC 8949) decoder for the structures FIDO2 hands
// us: attestation objects, authenticator data's attested credential data, and
// COSE keys. It decodes definite-length items only (CTAP2 canonical CBOR has
// no indefinite lengths), rejects floats and unknown simple values, bounds
// nesting depth and lengths, and reports how many bytes an item consumed so a
// caller can find what follows a COSE key inside authenticator data.

export class CborError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CborError";
  }
}

export type CborValue =
  | number
  | bigint
  | Uint8Array
  | string
  | boolean
  | null
  | CborValue[]
  | Map<CborKey, CborValue>;
export type CborKey = number | string;

const MAX_DEPTH = 16;
const MAX_ITEMS = 4096;

export function decodeCborItem(buf: Uint8Array, offset = 0): { value: CborValue; end: number } {
  const state = { items: 0 };
  return decodeAt(buf, offset, 0, state);
}

/** Decode exactly one item spanning the whole buffer. */
export function decodeCbor(buf: Uint8Array): CborValue {
  const { value, end } = decodeCborItem(buf, 0);
  if (end !== buf.length) {
    throw new CborError(`trailing bytes after CBOR item (${buf.length - end})`);
  }
  return value;
}

function readLength(
  buf: Uint8Array,
  offset: number,
  info: number,
): { n: number | bigint; next: number } {
  if (info < 24) {
    return { n: info, next: offset };
  }
  const need = info === 24 ? 1 : info === 25 ? 2 : info === 26 ? 4 : info === 27 ? 8 : -1;
  if (need < 0) {
    throw new CborError(`unsupported CBOR additional info ${info}`);
  }
  if (offset + need > buf.length) {
    throw new CborError("truncated CBOR length");
  }
  const view = new DataView(buf.buffer, buf.byteOffset + offset, need);
  let n: number | bigint;
  if (need === 1) {
    n = view.getUint8(0);
  } else if (need === 2) {
    n = view.getUint16(0);
  } else if (need === 4) {
    n = view.getUint32(0);
  } else {
    const big = view.getBigUint64(0);
    n = big <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(big) : big;
  }
  return { n, next: offset + need };
}

function asLength(n: number | bigint, remaining: number): number {
  if (typeof n === "bigint" || n > remaining) {
    throw new CborError("CBOR length exceeds the buffer");
  }
  return n;
}

function decodeAt(
  buf: Uint8Array,
  offset: number,
  depth: number,
  state: { items: number },
): { value: CborValue; end: number } {
  if (depth > MAX_DEPTH) {
    throw new CborError("CBOR nesting too deep");
  }
  if (++state.items > MAX_ITEMS) {
    throw new CborError("too many CBOR items");
  }
  if (offset >= buf.length) {
    throw new CborError("truncated CBOR item");
  }
  const initial = buf[offset];
  const major = initial >> 5;
  const info = initial & 0x1f;
  if (info === 31) {
    throw new CborError("indefinite-length CBOR is not accepted");
  }
  if (major === 7) {
    if (info === 20) {
      return { value: false, end: offset + 1 };
    }
    if (info === 21) {
      return { value: true, end: offset + 1 };
    }
    if (info === 22) {
      return { value: null, end: offset + 1 };
    }
    throw new CborError(`unsupported CBOR simple/float value ${info}`);
  }
  const { n, next } = readLength(buf, offset + 1, info);
  switch (major) {
    case 0:
      return { value: n, end: next };
    case 1:
      return { value: typeof n === "bigint" ? -1n - n : -1 - n, end: next };
    case 2: {
      const len = asLength(n, buf.length - next);
      return { value: buf.slice(next, next + len), end: next + len };
    }
    case 3: {
      const len = asLength(n, buf.length - next);
      const text = new TextDecoder("utf-8", { fatal: true }).decode(buf.subarray(next, next + len));
      return { value: text, end: next + len };
    }
    case 4: {
      const count = asLength(n, buf.length - next);
      const arr: CborValue[] = [];
      let at = next;
      for (let i = 0; i < count; i++) {
        const item = decodeAt(buf, at, depth + 1, state);
        arr.push(item.value);
        at = item.end;
      }
      return { value: arr, end: at };
    }
    case 5: {
      const count = asLength(n, buf.length - next);
      const map = new Map<CborKey, CborValue>();
      let at = next;
      for (let i = 0; i < count; i++) {
        const k = decodeAt(buf, at, depth + 1, state);
        if (typeof k.value !== "number" && typeof k.value !== "string") {
          throw new CborError("CBOR map keys must be integers or text");
        }
        if (map.has(k.value)) {
          throw new CborError("duplicate CBOR map key");
        }
        const v = decodeAt(buf, k.end, depth + 1, state);
        map.set(k.value, v.value);
        at = v.end;
      }
      return { value: map, end: at };
    }
    default:
      // Major type 6 (tags) never appears in the FIDO2 structures we read.
      throw new CborError(`unsupported CBOR major type ${major}`);
  }
}

/**
 * libfido2 prints authenticator data CBOR-wrapped (a byte string holding the
 * raw bytes). Unwrap it when it is exactly one byte string; return raw data
 * otherwise. Raw authenticator data starts with a 32-byte rpIdHash, so a
 * caller must say which form it expects; see `unwrapCborByteString`.
 */
export function unwrapCborByteString(buf: Uint8Array): Uint8Array {
  const value = decodeCbor(buf);
  if (!(value instanceof Uint8Array)) {
    throw new CborError("expected a CBOR byte string");
  }
  return value;
}
