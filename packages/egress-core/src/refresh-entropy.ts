// Per-scope random stream for the action batcher's refresh jitter.
//
// Each scope gets its own deterministic random bit generator (HMAC-SHA256 in
// counter mode) keyed by
//
//   seed = SHA3-256( host CSPRNG 32 bytes ‖ len(extra) ‖ extra ‖ scope id )
//
// `extra` is optional additional entropy from the hardware root, mixed in,
// never a replacement: the host bytes alone already make the seed
// unpredictable, so constant or adversarial extra bytes cannot make it
// predictable. The extra source is asked once per scope with a short timeout;
// when it is absent, busy, throws or is slow, the host bytes are used alone,
// and nothing ever waits on it for longer than the timeout. Nothing the agent
// controls (tool parameters, URLs, content, timing) is an input: the scope id
// is the host's run id.

import { createHash, createHmac, randomBytes } from "node:crypto";

/** Optional extra entropy: up to `maxBytes` bytes, or null when unavailable. */
export type RefreshEntropySource = (maxBytes: number) => Promise<Uint8Array | null>;

const ENTROPY_KEY = Symbol.for("enclawed.egress-core.refresh-entropy");
/** Longest a scope's seeding waits for the extra source. */
export const EXTRA_ENTROPY_TIMEOUT_MS = 200;
/** Most extra bytes asked for per scope. */
export const EXTRA_ENTROPY_MAX_BYTES = 64;

type EntropySlot = { source: RefreshEntropySource | null };

function entropySlot(): EntropySlot {
  const globals = globalThis as unknown as Record<symbol, EntropySlot | undefined>;
  let slot = globals[ENTROPY_KEY];
  if (!slot) {
    slot = { source: null };
    globals[ENTROPY_KEY] = slot;
  }
  return slot;
}

/** Install (or with null remove) the optional extra entropy source. The host does this. */
export function setRefreshEntropySource(source: RefreshEntropySource | null): void {
  entropySlot().source = source;
}

/** Extra bytes from the installed source, or empty on absence, error or timeout. */
async function extraEntropy(source: RefreshEntropySource | null): Promise<Uint8Array> {
  if (!source) {
    return new Uint8Array(0);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), EXTRA_ENTROPY_TIMEOUT_MS);
      timer.unref?.();
    });
    const bytes = await Promise.race([source(EXTRA_ENTROPY_MAX_BYTES), timeout]);
    if (!(bytes instanceof Uint8Array)) {
      return new Uint8Array(0);
    }
    return bytes.subarray(0, EXTRA_ENTROPY_MAX_BYTES);
  } catch {
    return new Uint8Array(0);
  } finally {
    clearTimeout(timer);
  }
}

export type ScopeSeedDeps = {
  /** Host CSPRNG; defaults to `crypto.randomBytes`. */
  hostBytes?: (n: number) => Uint8Array;
  /** Extra source; defaults to the installed one. */
  extra?: RefreshEntropySource | null;
};

/** The seed of one scope's jitter stream (see header). */
export async function deriveScopeSeed(scope: string, deps: ScopeSeedDeps = {}): Promise<Buffer> {
  const host = (deps.hostBytes ?? ((n) => randomBytes(n)))(32);
  const extra = await extraEntropy(deps.extra === undefined ? entropySlot().source : deps.extra);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(extra.byteLength);
  return createHash("sha3-256")
    .update(host)
    .update(len)
    .update(extra)
    .update(Buffer.from(scope, "utf8"))
    .digest();
}

/** Uniform integers in [min, max) from an HMAC-SHA256 counter-mode stream keyed by `seed`. */
export function createSeededRandomInt(seed: Uint8Array): (min: number, max: number) => number {
  let counter = 0;
  let pool = Buffer.alloc(0);
  const take = (n: number): Buffer => {
    while (pool.length < n) {
      const block = createHmac("sha256", seed).update(`jitter:${counter++}`).digest();
      pool = Buffer.concat([pool, block]);
    }
    const out = pool.subarray(0, n);
    pool = pool.subarray(n);
    return out;
  };
  return (min, max) => {
    const range = max - min;
    if (!Number.isInteger(range) || range <= 0 || range > 2 ** 32) {
      throw new RangeError(`bad range [${min}, ${max})`);
    }
    // Rejection sampling: no modulo bias.
    const limit = Math.floor(2 ** 32 / range) * range;
    for (;;) {
      const v = take(4).readUInt32BE(0);
      if (v < limit) {
        return min + (v % range);
      }
    }
  };
}
