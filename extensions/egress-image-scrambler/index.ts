import { registerMediaScrambler } from "@enclawed/egress-core";
import { definePluginEntry } from "@enclawed/plugin-sdk/plugin-entry";
import { resolveImageScramblerConfig } from "./src/config.js";
import { applyImageMediaScramble } from "./src/media-scrambler.js";

export default definePluginEntry({
  id: "egress-image-scrambler",
  name: "Egress Image Scrambler",
  description:
    "Image media scrambler: requantizes pixel bit depth (RGB and alpha, six " +
    "bits per channel by default), destroying the least-significant-bit channels an " +
    "attacker uses to smuggle a hidden bitstream while preserving the visible " +
    "image. Every payload is treated as suspect and scrambled unless a " +
    "host-installed media-exemption check accepts it. Registers as an image media " +
    "scrambler; the egress mediator applies it to outbound attachments.",
  register(api) {
    // Validated before registering: a bad value refuses the plugin.
    const config = resolveImageScramblerConfig(api.pluginConfig);
    if (!config.enabled) {
      return;
    }
    registerMediaScrambler({
      kind: "image",
      id: "egress-image-scrambler",
      scramble: (image) => applyImageMediaScramble(image, config.options),
    });
  },
});
