// Image scrambler — color-space, bit-depth, and mean-luminance covert-channel
// defense.
//
// Three carriers are addressed:
//
//   * per-pixel multi-bit LSB stego, killed by snapping each RGB channel to
//     64 evenly-spaced levels (= 6 bits/channel). This destroys both bit-0
//     (the classical LSB) AND bit-1 of every channel of every pixel,
//     defending against an attacker who --- knowing the defense exists ---
//     would simply move their stego up one bit. Empirically (see
//     image-adversarial.test.ts) the receiver's recovery rate on bit-0 and
//     bit-1 stego both fall to chance under this setting, and the per-pixel
//     visible change is at most 2 units out of 255 (sub-perceptual at 8-bit
//     color). Why not 7 bits (128 levels)? At step ~2.008 only bit-0 is
//     destroyed --- a knowing attacker recovers 100% of a bit-1 carrier ---
//     so 7-bit RGB defends only the naive case. Why not 5 bits (32 levels)?
//     The visible cost rises to 4 units, which is borderline-perceptible in
//     bright and mid-tone regions, and we have no covert-channel reason to
//     pay it for bit-3 destruction at this stage; deployments that want it
//     can configure depthLevels=32. Six bits is the elegant minimum that
//     defends against an aware adversary at sub-perceptual cost.
//
//     The defense was arrived at by elimination across the design space:
//     CMYK roundtrips with gentle quantization fail because K=0 (any
//     RGB-saturated pixel) is a fixed point of the unit-interval quantizer
//     and survives untouched; K-only quantization shares the same
//     immunity; random per-pixel sub-sampling of channels leaves an
//     untouched fraction the attacker reads through unchanged; a "7-bit
//     baseline + random 6-bit sprinkle" is strictly dominated by uniform
//     6-bit. The unique elegant minimum is uniform RGB requantization.
//     The CMYK basis remains available as a configurable option for
//     deployments that prefer a misaligned-grid story --- it gives the
//     same bit-defense at marginally higher visible distortion.
//
//   * per-image mean-luminance modulation across a sequence of images,
//     bounded by snapping the mean luma to one of N coarse buckets (a real
//     channel this paper documents; the bound is log2(N) bits/image);
//
//   * inter-image sequence-ID / ordering, addressed by the separate
//     canonical-media-sequence helper in @enclawed/egress-core (see media-
//     sequence.ts) at the host's media-egress chokepoint.
//
//   * alpha-channel LSB stego: the alpha byte carries bits exactly like a
//     color channel, so it is requantized to the same number of levels.
//     Fully opaque (255) and fully transparent (0) pixels are fixed points of
//     the quantizer, so an ordinary opaque image is unchanged by this step.
//
// Color conversion alone is exactly invertible and would destroy nothing
// --- the bit-depth reduction is the per-pixel mechanism; the luminance
// bucketing is the per-image mechanism.

import type { ImagePayload } from "@enclawed/egress-core";
import { cmykToRgb, requantize, requantizeUnit, rgbToCmyk } from "./colorspace.js";
import { applyMeanLuminanceBucket } from "./luminance.js";

export type ImageScramblerOptions = {
  /**
   * Basis in which the bit-depth requantization is performed. RGB is the
   * default; at depthLevels=64 it directly destroys bit-0 and bit-1 of
   * every channel. CMYK remains available for deployments that want the
   * requantization grid to be misaligned with any RGB-channel LSB encoding
   * (a "what if the attacker is RGB-LSB-aware" hedge); empirically it
   * gives the same bit-defense at marginally higher visible distortion.
   */
  colorSpace: "rgb" | "cmyk";
  /**
   * Requantize each component, and the alpha channel, to this many
   * evenly-spaced levels (256 disables). At 64 levels (the default, 6 bits/channel) the quantization
   * step is ~4.05, which collapses any pair of values differing by 2 to
   * the same output --- destroying both bit-0 and bit-1 stego while
   * changing each pixel by at most 2 units out of 255 (sub-perceptual).
   * 128 levels (7 bits) destroys only bit-0 and leaves a knowing attacker
   * to recover 100% of bit-1 stego; 32 levels (5 bits) destroys bits 0-2
   * at a borderline-visible cost. Naive reductions like "255 levels" do
   * NOT destroy any bit and are essentially a no-op against stego.
   */
  depthLevels: number;
  /**
   * Snap the per-image mean luminance to one of this many coarse buckets,
   * bounding the per-image mean-luminance covert channel to log2(buckets)
   * bits. Default 8 → 3 bits/image; set to 1 (or less) to disable.
   */
  luminanceBuckets: number;
};

export const defaultImageScramblerOptions: ImageScramblerOptions = {
  // RGB basis at 6 bits/channel: destroys bit-0 AND bit-1 stego at
  // sub-perceptual cost (maxΔ=2 per channel out of 255).
  colorSpace: "rgb",
  depthLevels: 64,
  luminanceBuckets: 8,
};

/**
 * Apply per-pixel bit-depth requantization and (when configured) per-image
 * mean-luminance bucketing. The pixel pass and the luminance pass commute
 * for our purposes: we run pixel requantization first so the luminance
 * bucketing operates on the already-quantized RGB values, which keeps the
 * final bucketing offset honest.
 */
export function scrambleImage(
  image: ImagePayload,
  options?: Partial<ImageScramblerOptions>,
): ImagePayload {
  const opts = { ...defaultImageScramblerOptions, ...options };
  const src = image.rgba;
  const out = new Uint8ClampedArray(src.length);
  const reduce = opts.depthLevels < 256;

  for (let p = 0; p < src.length; p += 4) {
    let r = src[p]!;
    let g = src[p + 1]!;
    let b = src[p + 2]!;

    if (opts.colorSpace === "cmyk") {
      let [c, m, y, k] = rgbToCmyk(r, g, b);
      if (reduce) {
        c = requantizeUnit(c, opts.depthLevels);
        m = requantizeUnit(m, opts.depthLevels);
        y = requantizeUnit(y, opts.depthLevels);
        k = requantizeUnit(k, opts.depthLevels);
      }
      [r, g, b] = cmykToRgb(c, m, y, k);
    } else if (reduce) {
      r = requantize(r, opts.depthLevels);
      g = requantize(g, opts.depthLevels);
      b = requantize(b, opts.depthLevels);
    }

    out[p] = r;
    out[p + 1] = g;
    out[p + 2] = b;
    // Alpha gets the same depth reduction as the color channels; it is an
    // integer channel in every basis, so it is requantized directly.
    out[p + 3] = reduce ? requantize(src[p + 3]!, opts.depthLevels) : src[p + 3]!;
  }

  const requantized: ImagePayload = {
    width: image.width,
    height: image.height,
    rgba: out,
    exemption: image.exemption,
  };
  if (opts.luminanceBuckets >= 2) {
    return applyMeanLuminanceBucket(requantized, opts.luminanceBuckets);
  }
  return requantized;
}
