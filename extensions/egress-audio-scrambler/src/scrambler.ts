// Audio scrambler — Fourier-domain covert-channel defense.
//
// Audio is a rich covert carrier. Two classes of hidden data survive ordinary
// playback and ordinary inspection:
//   - out-of-band energy: ultrasonic (> 20 kHz) and subsonic (< 20 Hz) tones a
//     human cannot hear but a receiver can demodulate (the basis of real
//     ultrasonic cross-device signalling);
//   - sub-perceptual in-band energy: tones far below the audible content's
//     level, e.g. a narrowband comb carrying a frequency-shift-keyed bitstream.
//
// The scrambler runs an FFT, zeroes every bin outside the human audible band
// and every bin whose magnitude is below a perceptual floor relative to the
// loudest bin, then runs the inverse FFT. What a human hears is preserved;
// what only a covert receiver could read is gone.

import type { AudioPayload } from "@enclawed/egress-core";
import { fft, ifft, nextPow2 } from "./fft.js";

export type AudioScramblerOptions = {
  /** Kill spectral energy below this frequency (Hz) — subsonic carriers. */
  minHz: number;
  /** Kill spectral energy above this frequency (Hz) — ultrasonic carriers. */
  maxHz: number;
  /**
   * Kill bins whose magnitude is below this fraction of the peak bin
   * magnitude — sub-perceptual narrowband stego. 0 disables. The default,
   * 0.003 (about -50 dB), removes carriers at -55 dB and below with margin;
   * content 50 dB under the loudest component is masked by it in practice.
   */
  perceptualFloor: number;
};

export const defaultAudioScramblerOptions: AudioScramblerOptions = {
  minHz: 20,
  maxHz: 20000,
  perceptualFloor: 0.003,
};

export type AudioScrambleReport = {
  /** Bins zeroed because they fell outside the audible band. */
  outOfBandBinsZeroed: number;
  /** Bins zeroed because they fell below the perceptual floor. */
  subPerceptualBinsZeroed: number;
};

/**
 * Band-limit and perceptually floor an audio payload. Returns the scrambled
 * audio and a report of how much covert-capable spectral content was removed.
 */
export function scrambleAudio(
  audio: AudioPayload,
  options?: Partial<AudioScramblerOptions>,
): { audio: AudioPayload; report: AudioScrambleReport } {
  const opts = { ...defaultAudioScramblerOptions, ...options };
  const len = audio.samples.length;
  const report: AudioScrambleReport = { outOfBandBinsZeroed: 0, subPerceptualBinsZeroed: 0 };
  if (len === 0) {
    return { audio, report };
  }

  const n = nextPow2(len);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < len; i++) {
    re[i] = audio.samples[i]!;
  }

  fft(re, im);

  let peak = 0;
  const mag = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    mag[k] = Math.hypot(re[k]!, im[k]!);
    if (mag[k]! > peak) {
      peak = mag[k]!;
    }
  }
  const floor = peak * Math.max(0, opts.perceptualFloor);

  for (let k = 0; k < n; k++) {
    // Bin k maps to |k| folded onto [0, n/2]; convert to a real frequency.
    const foldedBin = k <= n / 2 ? k : n - k;
    const freqHz = (foldedBin * audio.sampleRate) / n;
    const outOfBand = freqHz < opts.minHz || freqHz > opts.maxHz;
    const subPerceptual = !outOfBand && opts.perceptualFloor > 0 && mag[k]! < floor;
    if (outOfBand || subPerceptual) {
      re[k] = 0;
      im[k] = 0;
      if (outOfBand) {
        report.outOfBandBinsZeroed++;
      } else {
        report.subPerceptualBinsZeroed++;
      }
    }
  }

  ifft(re, im);

  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = Math.max(-1, Math.min(1, re[i]!));
  }
  return { audio: { sampleRate: audio.sampleRate, samples: out }, report };
}
