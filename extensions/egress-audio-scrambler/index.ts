import { registerMediaScrambler } from "@enclawed/egress-core";
import { definePluginEntry } from "@enclawed/plugin-sdk/plugin-entry";
import { resolveAudioScramblerEnabled, resolveAudioScramblerOptions } from "./src/config.js";
import { applyAudioMediaScramble } from "./src/media-scrambler.js";

export default definePluginEntry({
  id: "egress-audio-scrambler",
  name: "Egress Audio Scrambler",
  description:
    "Audio media scrambler: runs a Fourier analysis of outbound audio and " +
    "zeroes every spectral bin outside the human audible band (ultrasonic / " +
    "subsonic covert carriers) and every sub-perceptual bin (narrowband " +
    "stego), preserving what a human hears. Every payload is treated as " +
    "suspect (it could be audible-band sonified data) and scrambled unless " +
    "a host-installed media-exemption check accepts it. " +
    "Registers as an audio media scrambler; the egress mediator applies it " +
    "to outbound WAV attachments.",
  register(api) {
    // Validated before registering: a bad value refuses the plugin.
    const config = api.pluginConfig ?? {};
    if (!resolveAudioScramblerEnabled(config)) {
      return;
    }
    const options = resolveAudioScramblerOptions(config);
    registerMediaScrambler({
      kind: "audio",
      id: "egress-audio-scrambler",
      scramble: (audio) => applyAudioMediaScramble(audio, options),
    });
  },
});
