// Exemption-gated audio media scrambler.
//
// The pure `scrambleAudio` transform stays content-agnostic; this wrapper is
// what the host's media-egress chokepoint actually drains. The wrapper asks
// the host-installed media-exemption check (`@enclawed/egress-core`) whether
// the payload is known-legitimate (e.g. speech from a TTS engine the host
// trusts). If yes, the audio passes through unchanged, so the scrambler does
// not produce a false positive on real audio. If no, the audio is treated as
// suspect (it could be audible-band sonified data) and the FFT-based scramble
// runs.
//
// The decision is fail-secure: the open core installs no exemption check, so
// by default every payload scrambles.

import { type AudioPayload, isMediaExempt } from "@enclawed/egress-core";
import { type AudioScramblerOptions, scrambleAudio } from "./scrambler.js";

export function applyAudioMediaScramble(
  audio: AudioPayload,
  options?: Partial<AudioScramblerOptions>,
): AudioPayload {
  if (isMediaExempt({ kind: "audio", payload: audio })) {
    return audio;
  }
  return scrambleAudio(audio, options).audio;
}
