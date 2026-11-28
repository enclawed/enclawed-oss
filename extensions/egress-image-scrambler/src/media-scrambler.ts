// Exemption-gated image media scrambler.
//
// The pure `scrambleImage` transform stays content-agnostic; this wrapper is
// what the host's media-egress chokepoint actually drains. The wrapper asks
// the host-installed media-exemption check (`@enclawed/egress-core`) whether
// the payload is known-legitimate (e.g. a chart render from a producer the
// host trusts). If yes, the image passes through unchanged, so the
// requantization does not degrade real graphics. If no, the image is treated
// as suspect (it could be an LSB-stego carrier or pixel-positioned data) and
// the requantization runs.
//
// The decision is fail-secure: the open core installs no exemption check, so
// by default every payload scrambles.

import { type ImagePayload, isMediaExempt } from "@enclawed/egress-core";
import { type ImageScramblerOptions, scrambleImage } from "./scrambler.js";

export function applyImageMediaScramble(
  image: ImagePayload,
  options?: Partial<ImageScramblerOptions>,
): ImagePayload {
  if (isMediaExempt({ kind: "image", payload: image })) {
    return image;
  }
  return scrambleImage(image, options);
}
