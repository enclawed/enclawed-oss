// Audio-domain measurements against the shipped audio scrambler.
//
//   - ultrasonic: one inaudible carrier per secret bit (20.5-22.8 kHz) on top
//     of an audible 440 Hz tone; the receiver demodulates each carrier bin.
//   - sub-perceptual: one audible narrowband tone per secret bit (5-6 kHz)
//     a fixed number of dB below the loudest bin; the receiver reads each
//     tone bin. Measured at several depths because whether a tone is removed
//     depends on where it sits relative to the scrambler's perceptual floor
//     (default 0.003 of the loudest bin, about -50 dB).
//   - the paper's spectral figure: chord + 50-baud BFSK ultrasonic + a 5 kHz
//     tone, reporting the bins the scrambler zeroed and the residual level of
//     each covert component.

import { fft, scrambleAudio } from "../../../extensions/egress-audio-scrambler/api.js";
import { accuracyPct, makeRng, randomBits, reductionPct, type Bit } from "./stats.js";

const SAMPLE_RATE = 48000;

function spectrum(samples: Float32Array): Float64Array {
  const re = Float64Array.from(samples);
  const im = new Float64Array(samples.length);
  fft(re, im);
  const mag = new Float64Array(samples.length / 2);
  for (let k = 0; k < mag.length; k++) {
    mag[k] = Math.hypot(re[k], im[k]);
  }
  return mag;
}

export type AudioRow = {
  carrier: string;
  defense: string;
  reductionPct: number;
  receiverAccPct: number;
};

type Channel = {
  bits: number;
  n: number;
  encode(secret: Bit[]): Float32Array;
  decode(samples: Float32Array): Bit[];
};

/** Ultrasonic channel, as in the extension's adversarial suite. */
const ultrasonic: Channel = (() => {
  const N = 4096;
  const BITS = 24;
  const carrierHz = (i: number) => 20500 + i * 100;
  return {
    bits: BITS,
    n: N,
    encode(secret) {
      const s = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        s[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE);
      }
      secret.forEach((bit, b) => {
        if (bit !== 1) {
          return;
        }
        for (let i = 0; i < N; i++) {
          s[i] = s[i] + 0.15 * Math.sin((2 * Math.PI * carrierHz(b) * i) / SAMPLE_RATE);
        }
      });
      return s;
    },
    decode(samples) {
      const mag = spectrum(samples);
      return Array.from({ length: BITS }, (_, b) => {
        const bin = Math.round((carrierHz(b) * samples.length) / SAMPLE_RATE);
        return (mag[bin] > 30 ? 1 : 0) as Bit;
      });
    },
  };
})();

/** Sub-perceptual channel: tones `depthDb` below a bin-centered audible carrier. */
function subPerceptual(depthDb: number): Channel {
  const N = 4096;
  const BITS = 24;
  const CARRIER_BIN = 38; // ~445 Hz, bin-centered so it does not leak into tone bins
  const toneBin = (i: number) => 427 + i * 4; // ~5.0-6.1 kHz, audible
  const carrierAmp = 0.5;
  const toneAmp = carrierAmp * 10 ** (-depthDb / 20);
  const threshold = (toneAmp * N) / 4; // half the expected tone-bin magnitude
  return {
    bits: BITS,
    n: N,
    encode(secret) {
      const s = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        s[i] = carrierAmp * Math.sin((2 * Math.PI * CARRIER_BIN * i) / N);
      }
      secret.forEach((bit, b) => {
        if (bit !== 1) {
          return;
        }
        for (let i = 0; i < N; i++) {
          s[i] = s[i] + toneAmp * Math.sin((2 * Math.PI * toneBin(b) * i) / N);
        }
      });
      return s;
    },
    decode(samples) {
      const mag = spectrum(samples);
      return Array.from({ length: BITS }, (_, b) => (mag[toneBin(b)] > threshold ? 1 : 0) as Bit);
    },
  };
}

function measure(channel: Channel, defended: boolean, trials: number, seed: number) {
  const rand = makeRng(seed);
  const pairs: Array<[Bit, Bit]> = [];
  for (let t = 0; t < trials; t++) {
    const secret = randomBits(channel.bits, rand);
    const carrier = channel.encode(secret);
    const samples = defended
      ? scrambleAudio({ sampleRate: SAMPLE_RATE, samples: carrier }).audio.samples
      : carrier;
    const recovered = channel.decode(samples);
    for (let i = 0; i < channel.bits; i++) {
      pairs.push([secret[i], recovered[i]]);
    }
  }
  return { reductionPct: reductionPct(pairs), receiverAccPct: accuracyPct(pairs) };
}

export function runAudioBenchmark(trials = 30): AudioRow[] {
  const rows: AudioRow[] = [];
  const add = (carrier: string, defense: string, ch: Channel, defended: boolean, seed: number) =>
    rows.push({ carrier, defense, ...measure(ch, defended, trials, seed) });
  add("ultrasonic (>20 kHz)", "none", ultrasonic, false, 0xa0d10);
  add("ultrasonic (>20 kHz)", "FFT band-limit", ultrasonic, true, 0xa0d10);
  for (const db of [60, 70]) {
    add(`sub-perceptual (-${db} dB)`, "none", subPerceptual(db), false, 0x5b9);
    add(`sub-perceptual (-${db} dB)`, "perceptual floor", subPerceptual(db), true, 0x5b9);
  }
  return rows;
}

export type AudioFigure = {
  outOfBandBinsZeroed: number;
  subPerceptualBinsZeroed: number;
  /** Level of each component relative to the clean signal's loudest bin, before and after. */
  components: Array<{ name: string; hz: number; beforeDb: number; afterDb: number }>;
};

/** The paper's spectral figure, recomputed on the shipped scrambler. */
export function runAudioFigure(): AudioFigure {
  const LEN = 8192;
  const clean = (t: number) =>
    0.45 * Math.sin(2 * Math.PI * 440 * t) +
    0.3 * Math.sin(2 * Math.PI * 554 * t) +
    0.2 * Math.sin(2 * Math.PI * 659 * t);
  const contaminated = (t: number) => {
    const f = (Math.floor(t * 50) & 1) === 1 ? 22500 : 21500;
    return clean(t) + 0.2 * Math.sin(2 * Math.PI * f * t) + 1e-3 * Math.sin(2 * Math.PI * 5000 * t);
  };
  const synth = (fn: (t: number) => number) => {
    const s = new Float32Array(LEN);
    for (let i = 0; i < LEN; i++) {
      s[i] = fn(i / SAMPLE_RATE);
    }
    return s;
  };
  const cleanMag = spectrum(synth(clean));
  const dirty = synth(contaminated);
  const { audio, report } = scrambleAudio({ sampleRate: SAMPLE_RATE, samples: dirty });
  const before = spectrum(dirty);
  const after = spectrum(audio.samples);
  const peak = cleanMag.reduce((m, v) => Math.max(m, v), 0);
  const db = (v: number) => 20 * Math.log10(Math.max(v, peak * 1e-6) / peak);
  const bin = (hz: number) => Math.round((hz * LEN) / SAMPLE_RATE);
  const localMax = (mag: Float64Array, hz: number) =>
    Math.max(...[-2, -1, 0, 1, 2].map((d) => mag[bin(hz) + d] ?? 0));
  return {
    outOfBandBinsZeroed: report.outOfBandBinsZeroed,
    subPerceptualBinsZeroed: report.subPerceptualBinsZeroed,
    components: [
      { name: "chord 440 Hz", hz: 440 },
      { name: "BFSK f0", hz: 21500 },
      { name: "BFSK f1", hz: 22500 },
      { name: "sub-perceptual 5 kHz", hz: 5000 },
    ].map((c) => ({
      ...c,
      beforeDb: db(localMax(before, c.hz)),
      afterDb: db(localMax(after, c.hz)),
    })),
  };
}
