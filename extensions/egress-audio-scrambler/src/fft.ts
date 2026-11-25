// Radix-2 iterative Cooley-Tukey FFT. Pure TypeScript, no native dependency.
// Operates in place on parallel real/imaginary arrays whose length is a power
// of two.

/** Smallest power of two >= n (>= 1). */
export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) {
    p <<= 1;
  }
  return p;
}

/** In-place forward FFT. `re` and `im` must have equal power-of-two length. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n <= 1) {
    return;
  }

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }

  // Butterflies.
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const vr = re[b]! * cr - im[b]! * ci;
        const vi = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - vr;
        im[b] = im[a]! - vi;
        re[a] = re[a]! + vr;
        im[a] = im[a]! + vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** In-place inverse FFT (normalized by 1/n). */
export function ifft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n <= 1) {
    return;
  }
  for (let i = 0; i < n; i++) {
    im[i] = -im[i]!;
  }
  fft(re, im);
  for (let i = 0; i < n; i++) {
    re[i] = re[i]! / n;
    im[i] = -im[i]! / n;
  }
}
