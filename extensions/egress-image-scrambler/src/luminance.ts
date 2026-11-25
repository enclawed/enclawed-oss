// Per-image mean-luminance channel defense.
//
// An attacker who emits a sequence of images can encode bits in the
// per-image mean luminance: image_i carries 1-or-more bits depending on
// which luminance bucket its mean falls into. The CMYK bit-depth scrambler
// does not touch this channel --- it perturbs individual pixels but not the
// gross average.
//
// The honest defensive position is that this channel can be REDUCED, not
// destroyed, at the application layer without ruining legitimate images:
// clamping every image to one fixed mean luminance would make a dark chart
// and a bright chart look identically grey, which is unusable. Bucketing the
// mean luminance to N coarse levels bounds the channel to log2(N) bits per
// image; rate-limiting through the capacity ledger then bounds the
// across-sequence aggregate. Images a host-installed media-exemption check
// accepts retain their natural luminance; every other image is bucketed.

import type { ImagePayload } from "@enclawed/egress-core";

/** ITU-R BT.601 luma: a perceptually weighted grayscale. */
export function pixelLuma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Mean luma (0-255) of an image's RGB pixels. Alpha is not weighted. */
export function meanLuminance(image: Pick<ImagePayload, "rgba">): number {
  const src = image.rgba;
  if (src.length === 0) {
    return 0;
  }
  let sum = 0;
  let count = 0;
  for (let p = 0; p < src.length; p += 4) {
    sum += pixelLuma(src[p]!, src[p + 1]!, src[p + 2]!);
    count++;
  }
  return count === 0 ? 0 : sum / count;
}

/**
 * Snap a 0-255 mean-luminance value to the centre of one of `buckets`
 * equally-spaced bands. With buckets=8 the per-image luminance channel
 * carries at most 3 bits; with buckets=4, 2 bits.
 */
export function bucketLuma(meanLuma: number, buckets: number): number {
  if (buckets < 2) {
    return meanLuma;
  }
  const idx = Math.min(buckets - 1, Math.max(0, Math.floor((meanLuma / 256) * buckets)));
  // Centre of the bucket --- deterministic per bucket.
  return ((idx + 0.5) / buckets) * 255;
}

/**
 * Snap an image's mean luminance to the nearest bucket centre by applying a
 * uniform additive offset to every RGB component. The offset is the same for
 * every pixel and every channel, so the image's relative chromatic / shape
 * content is preserved and only its gross brightness shifts onto the bucket
 * grid.
 *
 * Returns a new ImagePayload --- the caller decides whether to chain it with
 * the per-pixel bit-depth scrambler.
 */
export function applyMeanLuminanceBucket(image: ImagePayload, buckets: number): ImagePayload {
  if (buckets < 2) {
    return image;
  }
  const current = meanLuminance(image);
  const target = bucketLuma(current, buckets);
  const offset = target - current; // can be negative
  if (offset === 0) {
    return image;
  }
  const src = image.rgba;
  const out = new Uint8ClampedArray(src.length);
  for (let p = 0; p < src.length; p += 4) {
    out[p] = clamp8(src[p]! + offset);
    out[p + 1] = clamp8(src[p + 1]! + offset);
    out[p + 2] = clamp8(src[p + 2]! + offset);
    out[p + 3] = src[p + 3]!; // alpha preserved
  }
  return { width: image.width, height: image.height, rgba: out, exemption: image.exemption };
}

function clamp8(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}
