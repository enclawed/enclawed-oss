import { R as isMediaExempt } from "./src-Bv_GP2Sj.js";
//#region extensions/egress-audio-scrambler/src/fft.ts
/** Smallest power of two >= n (>= 1). */
function nextPow2(n) {
	let p = 1;
	while (p < n) p <<= 1;
	return p;
}
/** In-place forward FFT. `re` and `im` must have equal power-of-two length. */
function fft(re, im) {
	const n = re.length;
	if (n <= 1) return;
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		if (i < j) {
			const tr = re[i];
			re[i] = re[j];
			re[j] = tr;
			const ti = im[i];
			im[i] = im[j];
			im[j] = ti;
		}
	}
	for (let len = 2; len <= n; len <<= 1) {
		const ang = -2 * Math.PI / len;
		const wr = Math.cos(ang);
		const wi = Math.sin(ang);
		for (let i = 0; i < n; i += len) {
			let cr = 1;
			let ci = 0;
			const half = len >> 1;
			for (let k = 0; k < half; k++) {
				const a = i + k;
				const b = a + half;
				const vr = re[b] * cr - im[b] * ci;
				const vi = re[b] * ci + im[b] * cr;
				re[b] = re[a] - vr;
				im[b] = im[a] - vi;
				re[a] = re[a] + vr;
				im[a] = im[a] + vi;
				const ncr = cr * wr - ci * wi;
				ci = cr * wi + ci * wr;
				cr = ncr;
			}
		}
	}
}
/** In-place inverse FFT (normalized by 1/n). */
function ifft(re, im) {
	const n = re.length;
	if (n <= 1) return;
	for (let i = 0; i < n; i++) im[i] = -im[i];
	fft(re, im);
	for (let i = 0; i < n; i++) {
		re[i] = re[i] / n;
		im[i] = -im[i] / n;
	}
}
//#endregion
//#region extensions/egress-audio-scrambler/src/scrambler.ts
const defaultAudioScramblerOptions = {
	minHz: 20,
	maxHz: 2e4,
	perceptualFloor: .003
};
/**
* Band-limit and perceptually floor an audio payload. Returns the scrambled
* audio and a report of how much covert-capable spectral content was removed.
*/
function scrambleAudio(audio, options) {
	const opts = {
		...defaultAudioScramblerOptions,
		...options
	};
	const len = audio.samples.length;
	const report = {
		outOfBandBinsZeroed: 0,
		subPerceptualBinsZeroed: 0
	};
	if (len === 0) return {
		audio,
		report
	};
	const n = nextPow2(len);
	const re = new Float64Array(n);
	const im = new Float64Array(n);
	for (let i = 0; i < len; i++) re[i] = audio.samples[i];
	fft(re, im);
	let peak = 0;
	const mag = new Float64Array(n);
	for (let k = 0; k < n; k++) {
		mag[k] = Math.hypot(re[k], im[k]);
		if (mag[k] > peak) peak = mag[k];
	}
	const floor = peak * Math.max(0, opts.perceptualFloor);
	for (let k = 0; k < n; k++) {
		const freqHz = (k <= n / 2 ? k : n - k) * audio.sampleRate / n;
		const outOfBand = freqHz < opts.minHz || freqHz > opts.maxHz;
		const subPerceptual = !outOfBand && opts.perceptualFloor > 0 && mag[k] < floor;
		if (outOfBand || subPerceptual) {
			re[k] = 0;
			im[k] = 0;
			if (outOfBand) report.outOfBandBinsZeroed++;
			else report.subPerceptualBinsZeroed++;
		}
	}
	ifft(re, im);
	const out = new Float32Array(len);
	for (let i = 0; i < len; i++) out[i] = Math.max(-1, Math.min(1, re[i]));
	return {
		audio: {
			sampleRate: audio.sampleRate,
			samples: out
		},
		report
	};
}
//#endregion
//#region extensions/egress-audio-scrambler/src/media-scrambler.ts
function applyAudioMediaScramble(audio, options) {
	if (isMediaExempt({
		kind: "audio",
		payload: audio
	})) return audio;
	return scrambleAudio(audio, options).audio;
}
//#endregion
export { ifft as a, fft as i, defaultAudioScramblerOptions as n, nextPow2 as o, scrambleAudio as r, applyAudioMediaScramble as t };
