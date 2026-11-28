import type { AudioPayload } from "@enclawed/egress-core";
import { describe, expect, it } from "vitest";
import { fft } from "./fft.js";
import { scrambleAudio } from "./scrambler.js";

const SAMPLE_RATE = 48000;
const N = 4096;

/** Synthesize a tone of `freqHz` and amplitude `amp` over N samples. */
function tone(freqHz: number, amp: number): Float32Array {
  const s = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    s[i] = amp * Math.sin((2 * Math.PI * freqHz * i) / SAMPLE_RATE);
  }
  return s;
}

/** Magnitude at the FFT bin nearest `freqHz`. */
function magnitudeAt(samples: Float32Array, freqHz: number): number {
  const re = Float64Array.from(samples);
  const im = new Float64Array(samples.length);
  fft(re, im);
  const bin = Math.round((freqHz * samples.length) / SAMPLE_RATE);
  return Math.hypot(re[bin]!, im[bin]!);
}

describe("scrambleAudio", () => {
  it("returns empty audio unchanged", () => {
    const empty: AudioPayload = { sampleRate: SAMPLE_RATE, samples: new Float32Array(0) };
    expect(scrambleAudio(empty).audio.samples.length).toBe(0);
  });

  it("removes an ultrasonic tone while preserving an audible one", () => {
    const mixed = new Float32Array(N);
    const audible = tone(440, 0.5);
    const ultrasonic = tone(22000, 0.3);
    for (let i = 0; i < N; i++) {
      mixed[i] = audible[i]! + ultrasonic[i]!;
    }
    const payload: AudioPayload = { sampleRate: SAMPLE_RATE, samples: mixed };

    const before440 = magnitudeAt(mixed, 440);
    const before22k = magnitudeAt(mixed, 22000);
    expect(before22k).toBeGreaterThan(100); // the ultrasonic tone is really there

    const { audio, report } = scrambleAudio(payload);
    const after440 = magnitudeAt(audio.samples, 440);
    const after22k = magnitudeAt(audio.samples, 22000);

    // Audible content survives; the ultrasonic carrier is gone.
    expect(after440).toBeGreaterThan(before440 * 0.9);
    expect(after22k).toBeLessThan(before22k * 0.01);
    expect(report.outOfBandBinsZeroed).toBeGreaterThan(0);
  });

  it("removes a subsonic tone", () => {
    const payload: AudioPayload = { sampleRate: SAMPLE_RATE, samples: tone(6, 0.4) };
    const { audio } = scrambleAudio(payload);
    expect(magnitudeAt(audio.samples, 6)).toBeLessThan(magnitudeAt(payload.samples, 6) * 0.05);
  });
});
