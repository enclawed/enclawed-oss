// Figures published in "covert-channel egress" (arXiv:2605.20734), keyed so
// the benchmark can print a paper-vs-open-code diff. Values are copied from
// the paper's tables; `null` marks a cell the paper leaves empty.

export const PAPER_TEXT: Record<
  string,
  { default: number | null; enforce: number; detected: number | null }
> = {
  "zero-width-interleave": { default: 100, enforce: 100, detected: 100 },
  "unicode-tag-append": { default: 100, enforce: 100, detected: 100 },
  "variation-selector-append": { default: 100, enforce: 100, detected: 100 },
  "bidi-control-append": { default: 100, enforce: 100, detected: 100 },
  "homoglyph-substitution": { default: 100, enforce: 100, detected: 100 },
  "json-key-ordering": { default: 100, enforce: 100, detected: 100 },
  "whitespace-count": { default: 0, enforce: 100, detected: 100 },
  "punctuation-count": { default: 0, enforce: 100, detected: 100 },
  "synonym-substitution": { default: 0, enforce: 100, detected: 100 },
  "base64-blob": { default: 0, enforce: 100, detected: 100 },
  "timing-interval": { default: null, enforce: 100, detected: null },
};

export const PAPER_TEXT_MEAN = { default: 60.2, enforce: 100 };

export const PAPER_LINGUISTIC: Record<
  string,
  { undefended: number; scrambled: number; acc: number }
> = {
  "synonym-choice-1bit": { undefended: 0.1, scrambled: 100, acc: 51.6 },
  "synonym-choice-2bit": { undefended: 0.1, scrambled: 100, acc: 51.6 },
  "contraction-form": { undefended: 0.1, scrambled: 100, acc: 51.6 },
  "voice-active-passive": { undefended: 0.1, scrambled: 100, acc: 51.6 },
};

/** Image LSB table: naive bit-0 accuracy, aware bit-1 accuracy, bit-0 reduction. */
export const PAPER_IMAGE: Record<string, { bit0: number; bit1: number; reduction: number }> = {
  "RGB 256 (no defense)": { bit0: 100, bit1: 100, reduction: 0 },
  "RGB 128 (7 bits/ch)": { bit0: 50, bit1: 100, reduction: 100 },
  "RGB 64 (6 bits/ch, DEFAULT)": { bit0: 50.6, bit1: 50, reduction: 100 },
  "RGB 32 (5 bits/ch)": { bit0: 50.8, bit1: 51.4, reduction: 100 },
};

/** Design-space master table: bit-0 acc, bit-1 acc, max delta, mean delta. */
export const PAPER_DESIGN_SPACE: Record<string, [number, number, number, number]> = {
  "RGB 256 (no defense)": [100.0, 100.0, 0, 0.0],
  "RGB 255 (one level less)": [99.4, 99.3, 1, 0.0],
  "RGB 200": [76.7, 88.9, 1, 0.21],
  "RGB 128 (7 bits/ch)": [50.0, 100.0, 1, 0.51],
  "RGB 64 (6 bits/ch, DEFAULT)": [50.6, 50.0, 2, 1.0],
  "RGB 32 (5 bits/ch)": [50.8, 51.3, 4, 2.04],
  "RGB 16 (4 bits/ch)": [52.4, 52.5, 8, 4.2],
  "CMYK 255 (one level less)": [88.1, 94.2, 1, 0.08],
  "CMYK 128 (7 bits/comp)": [52.3, 82.2, 2, 0.47],
  "CMYK 64 (6 bits/comp)": [51.4, 51.8, 3, 0.97],
  "CMYK 32 (5 bits/comp)": [50.0, 51.1, 7, 2.07],
  "K-only 4 bits (others full)": [51.5, 48.0, 8, 3.37],
  "K-only 2 bits (others full)": [51.6, 52.5, 42, 20.31],
  "CMYK random in [7, 8] bits": [71.9, 89.6, 2, 0.27],
  "CMYK random in [6, 7] bits": [50.4, 65.0, 3, 0.75],
  "CMYK random in [5, 7] bits": [50.5, 58.3, 7, 1.23],
  "RGB: random 1-of-3 ch at 7 bit": [83.3, 100.0, 1, 0.17],
  "RGB 7-bit + 25% sprinkle 6-bit": [49.5, 87.8, 2, 0.64],
  "RGB 7-bit + 50% sprinkle 6-bit": [49.4, 75.5, 2, 0.76],
};

export const PAPER_AUDIO: Record<string, { reduction: number; acc: number }> = {
  "ultrasonic (>20 kHz)|none": { reduction: 0, acc: 100 },
  "ultrasonic (>20 kHz)|FFT band-limit": { reduction: 100, acc: 52.7 },
  "sub-perceptual (-60 dB)|none": { reduction: 0, acc: 99.4 },
  "sub-perceptual (-60 dB)|perceptual floor": { reduction: 100, acc: 51.1 },
};

export const PAPER_AUDIO_FIGURE = { outOfBandBinsZeroed: 1372, subPerceptualBinsZeroed: 5792 };
