// Plugin config -> image-scrambler options. A bad value refuses the plugin at
// load rather than running a scrambler weaker than configured. depthLevels
// and luminanceBuckets are tighten-only (settings audit #58-#59): the shipped
// 64 levels and 8 buckets are the most allowed, because more levels keep
// low-order stego bits (256 disables requantization) and more buckets carry
// more bits per image; 1 bucket used to turn the luminance defense off.
//
// `colorSpace` ("rgb" | "cmyk") selects the requantization basis. The
// earlier boolean `colorSpaceRoundtrip` was documented in the config schema
// before it was wired; it is kept as an alias (true = "cmyk", false = "rgb").
// Setting both with conflicting values is refused.

import { createPluginConfigReader } from "@enclawed/egress-core";
import { defaultImageScramblerOptions, type ImageScramblerOptions } from "./scrambler.js";

export type ImageScramblerConfig = { enabled: boolean; options: ImageScramblerOptions };

export function resolveImageScramblerConfig(raw: unknown): ImageScramblerConfig {
  const r = createPluginConfigReader("egress-image-scrambler", raw, [
    "enabled",
    "colorSpace",
    "colorSpaceRoundtrip",
    "depthLevels",
    "luminanceBuckets",
  ]);
  const d = defaultImageScramblerOptions;
  let colorSpace = r.oneOf("colorSpace", ["rgb", "cmyk"] as const, d.colorSpace);
  if (r.has("colorSpaceRoundtrip")) {
    const alias = r.bool("colorSpaceRoundtrip", false) ? "cmyk" : "rgb";
    if (r.has("colorSpace") && alias !== colorSpace) {
      r.fail(`colorSpaceRoundtrip (${alias}) conflicts with colorSpace (${colorSpace})`);
    }
    colorSpace = alias;
  }
  return {
    enabled: r.bool("enabled", true),
    options: {
      colorSpace,
      depthLevels: r.number("depthLevels", d.depthLevels, {
        integer: true,
        min: 2,
        max: d.depthLevels,
      }),
      luminanceBuckets: r.number("luminanceBuckets", d.luminanceBuckets, {
        integer: true,
        min: 2,
        max: d.luminanceBuckets,
      }),
    },
  };
}
