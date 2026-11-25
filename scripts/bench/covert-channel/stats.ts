// Statistics shared by every covert-channel measurement in the benchmark.
//
// Residual capacity is the empirical mutual information I(secret; recovered)
// with the Miller-Madow bias correction. When the receiver's output is
// constant or independent of the secret, I = 0 exactly, so a destroyed channel
// measures as zero residual capacity rather than the artifact a
// symmetric-channel accuracy proxy leaves behind.

export type Bit = 0 | 1;

/** Deterministic RNG (mulberry32) so every table is reproducible. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomBits(n: number, rand: () => number): Bit[] {
  return Array.from({ length: n }, () => (rand() < 0.5 ? 0 : 1) as Bit);
}

export function padBits(bits: Bit[], n: number): Bit[] {
  const out = bits.slice(0, n);
  while (out.length < n) {
    out.push(0);
  }
  return out;
}

export function bitsToInt(bits: Bit[]): number {
  return bits.reduce((acc, b) => acc * 2 + b, 0);
}

export function intToBits(value: number, n: number): Bit[] {
  const out: Bit[] = [];
  let v = value;
  for (let i = 0; i < n; i++) {
    out.unshift((v & 1) as Bit);
    v = Math.floor(v / 2);
  }
  return out;
}

/**
 * Empirical mutual information I(X;Y), Miller-Madow corrected, over discrete
 * symbols. For binary pairs this is bits per transmitted bit.
 */
export function mutualInformation(pairs: ReadonlyArray<readonly [number, number]>): number {
  const n = pairs.length;
  if (n === 0) {
    return 0;
  }
  const joint = new Map<string, number>();
  const px = new Map<number, number>();
  const py = new Map<number, number>();
  for (const [x, y] of pairs) {
    const key = `${x}|${y}`;
    joint.set(key, (joint.get(key) ?? 0) + 1);
    px.set(x, (px.get(x) ?? 0) + 1);
    py.set(y, (py.get(y) ?? 0) + 1);
  }
  let mi = 0;
  for (const [key, count] of joint) {
    const [xs, ys] = key.split("|");
    const pxy = count / n;
    const pX = (px.get(Number(xs)) ?? 0) / n;
    const pY = (py.get(Number(ys)) ?? 0) / n;
    mi += pxy * Math.log2(pxy / (pX * pY));
  }
  const correction = ((px.size - 1) * (py.size - 1)) / (2 * n * Math.LN2);
  return Math.max(0, mi - correction);
}

/** Binary convenience wrapper: bits of residual capacity per transmitted bit. */
export function mutualInformationBits(pairs: ReadonlyArray<readonly [Bit, Bit]>): number {
  return mutualInformation(pairs);
}

/** Capacity reduction in percent, 1 - I(X;Y) per bit. */
export function reductionPct(pairs: ReadonlyArray<readonly [Bit, Bit]>): number {
  return (1 - mutualInformationBits(pairs)) * 100;
}

export function accuracyPct(pairs: ReadonlyArray<readonly [Bit, Bit]>): number {
  if (pairs.length === 0) {
    return 50;
  }
  let matched = 0;
  for (const [x, y] of pairs) {
    if (x === y) {
      matched++;
    }
  }
  return (matched / pairs.length) * 100;
}
