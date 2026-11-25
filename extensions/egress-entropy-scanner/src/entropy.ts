// Token-entropy scanning — payload content analysis.
//
// This is the *detection* layer. It does not transform the payload; it
// measures how much covert capacity the text plausibly carries and reports a
// residual-bit estimate that the capacity ledger then accounts for.
//
// Signals:
//   - base64 / hex blobs : long encoded runs (the classic exfil carrier)
//   - high char entropy  : a message whose symbol distribution is near-random
//   - incompressibility  : text that a general compressor cannot shrink
// The bit estimates are deliberate *upper bounds* — over-counting covert
// capacity is the safe direction for a security control.

import { deflateSync } from "node:zlib";
import { shannonEntropyBits } from "@enclawed/egress-core";

export type EntropyOptions = {
  /** Minimum length of a base64/hex run to flag. */
  minBlobLength: number;
  /** Char-entropy (bits/char) above which the whole message is flagged. */
  entropyThresholdBits: number;
  /** Compression ratio above which text is deemed incompressible. */
  incompressibleRatio: number;
};

export const defaultEntropyOptions: EntropyOptions = {
  minBlobLength: 64,
  entropyThresholdBits: 5.4,
  incompressibleRatio: 0.92,
};

export type EntropyFinding = {
  severity: "info" | "low" | "medium" | "high";
  code: string;
  message: string;
  estimatedBits: number;
};

export type EntropyReport = {
  /** Upper-bound estimate of covert bits this payload could carry. */
  estimatedCovertBits: number;
  /** Char-distribution Shannon entropy (bits/char). */
  entropyBits: number;
  findings: EntropyFinding[];
};

/** Ratio of DEFLATE-compressed size to raw size (1 ≈ incompressible). */
export function compressionRatio(text: string): number {
  if (text.length < 16) {
    return 0;
  }
  const raw = Buffer.from(text, "utf8");
  if (raw.length === 0) {
    return 0;
  }
  return deflateSync(raw).length / raw.length;
}

/** Analyze a payload and estimate the covert capacity it carries. */
export function scanEntropy(text: string, options?: Partial<EntropyOptions>): EntropyReport {
  const opts = { ...defaultEntropyOptions, ...options };
  const findings: EntropyFinding[] = [];
  let estimatedCovertBits = 0;

  // 1. base64-like blobs — ~6 bits of payload per char.
  const base64Re = new RegExp(`[A-Za-z0-9+/]{${opts.minBlobLength},}={0,2}`, "g");
  for (const match of text.matchAll(base64Re)) {
    const len = match[0].length;
    const bits = Math.round(len * 6);
    estimatedCovertBits += bits;
    findings.push({
      severity: "high",
      code: "base64-blob",
      message: `base64-like run of ${len} characters`,
      estimatedBits: bits,
    });
  }

  // 2. hex blobs — 4 bits per char.
  const hexRe = new RegExp(`\\b[0-9a-fA-F]{${opts.minBlobLength},}\\b`, "g");
  for (const match of text.matchAll(hexRe)) {
    const len = match[0].length;
    const bits = len * 4;
    estimatedCovertBits += bits;
    findings.push({
      severity: "high",
      code: "hex-blob",
      message: `hex run of ${len} characters`,
      estimatedBits: bits,
    });
  }

  // 3. overall char entropy.
  const entropyBits = shannonEntropyBits(text);
  if (text.length >= 32 && entropyBits > opts.entropyThresholdBits) {
    const bits = Math.round((entropyBits - opts.entropyThresholdBits) * text.length);
    estimatedCovertBits += bits;
    findings.push({
      severity: "medium",
      code: "high-entropy",
      message: `char entropy ${entropyBits.toFixed(2)} bits/char exceeds ${opts.entropyThresholdBits}`,
      estimatedBits: bits,
    });
  }

  // 4. compressibility — incompressible text is encoded or random.
  if (text.length >= 64) {
    const ratio = compressionRatio(text.slice(0, 65536));
    if (ratio > opts.incompressibleRatio) {
      const bits = Math.round(text.length * 2);
      estimatedCovertBits += bits;
      findings.push({
        severity: "medium",
        code: "incompressible",
        message: `compression ratio ${ratio.toFixed(2)} — payload is near-incompressible`,
        estimatedBits: bits,
      });
    }
  }

  return { estimatedCovertBits, entropyBits, findings };
}
