// Tests for the exemption-gated audio media scrambler.
//
//   1. with no host exemption check (the open-core default) every payload is
//      scrambled --- it could be audible-band sonified data;
//   2. audio the host's check accepts is returned unchanged (same object);
//   3. a check that rejects routes the audio through the scrambler.

import {
  type AudioPayload,
  resetMediaExemption,
  setMediaExemptionCheck,
} from "@enclawed/egress-core";
import { afterEach, describe, expect, it } from "vitest";
import { applyAudioMediaScramble } from "./media-scrambler.js";

function makeAudio(seed: number): AudioPayload {
  // Mix of audible 440 Hz tone and a 22 kHz ultrasonic carrier --- the
  // ultrasonic component is what the scrambler should kill.
  const sampleRate = 48000;
  const samples = new Float32Array(2048);
  for (let i = 0; i < samples.length; i++) {
    samples[i] =
      0.6 * Math.sin((2 * Math.PI * 440 * (i + seed)) / sampleRate) +
      0.3 * Math.sin((2 * Math.PI * 22000 * (i + seed)) / sampleRate);
  }
  return { sampleRate, samples };
}

afterEach(() => {
  resetMediaExemption();
});

describe("applyAudioMediaScramble", () => {
  it("scrambles audio when no exemption check is installed (fail-secure default)", () => {
    const audio: AudioPayload = { ...makeAudio(0), exemption: { claimed: true } };
    const out = applyAudioMediaScramble(audio);
    // The scramble allocates a new Float32Array --- the buffer identity changes
    // and the values differ where ultrasonic energy was removed.
    expect(out.samples).not.toBe(audio.samples);
    let maxDelta = 0;
    for (let i = 0; i < audio.samples.length; i++) {
      const d = Math.abs(out.samples[i]! - audio.samples[i]!);
      if (d > maxDelta) {
        maxDelta = d;
      }
    }
    expect(maxDelta).toBeGreaterThan(0.05); // ultrasonic component removed
  });

  it("passes audio the host check accepts through unchanged", () => {
    setMediaExemptionCheck((s) => s.kind === "audio" && s.payload.exemption === "tts");
    const audio: AudioPayload = { ...makeAudio(1), exemption: "tts" };
    const out = applyAudioMediaScramble(audio);
    expect(out).toBe(audio);
    expect(out.samples).toBe(audio.samples);
  });

  it("scrambles audio the host check rejects", () => {
    setMediaExemptionCheck((s) => s.payload.exemption === "tts");
    const audio: AudioPayload = { ...makeAudio(2), exemption: "music" };
    expect(applyAudioMediaScramble(audio).samples).not.toBe(audio.samples);
  });
});
