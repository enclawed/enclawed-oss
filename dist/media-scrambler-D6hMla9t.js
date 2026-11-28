import { P as createPluginConfigReader, R as isMediaExempt } from "./src-Bv_GP2Sj.js";
//#region extensions/egress-image-scrambler/src/colorspace.ts
/** RGB (0-255) -> CMYK (each 0-1). */
function rgbToCmyk(r, g, b) {
	const rf = r / 255;
	const gf = g / 255;
	const bf = b / 255;
	const k = 1 - Math.max(rf, gf, bf);
	if (k >= 1) return [
		0,
		0,
		0,
		1
	];
	const d = 1 - k;
	return [
		(1 - rf - k) / d,
		(1 - gf - k) / d,
		(1 - bf - k) / d,
		k
	];
}
/** CMYK (each 0-1) -> RGB (0-255, rounded). */
function cmykToRgb(c, m, y, k) {
	const d = 1 - k;
	return [
		Math.round(255 * (1 - c) * d),
		Math.round(255 * (1 - m) * d),
		Math.round(255 * (1 - y) * d)
	];
}
/**
* Snap a 0-255 channel value to `levels` evenly spaced levels and back. With
* `levels` = 64 this clears the low two bits; `levels` >= 256 is a no-op.
*/
function requantize(value, levels) {
	if (levels >= 256 || levels < 2) return value;
	const step = 255 / (levels - 1);
	return Math.round(Math.round(value / step) * step);
}
/** Snap a unit (0-1) component — e.g. a CMYK channel — to `levels` levels. */
function requantizeUnit(value, levels) {
	if (levels < 2) return value;
	return Math.round(value * (levels - 1)) / (levels - 1);
}
//#endregion
//#region extensions/egress-image-scrambler/src/luminance.ts
/** ITU-R BT.601 luma: a perceptually weighted grayscale. */
function pixelLuma(r, g, b) {
	return .299 * r + .587 * g + .114 * b;
}
/** Mean luma (0-255) of an image's RGB pixels. Alpha is not weighted. */
function meanLuminance(image) {
	const src = image.rgba;
	if (src.length === 0) return 0;
	let sum = 0;
	let count = 0;
	for (let p = 0; p < src.length; p += 4) {
		sum += pixelLuma(src[p], src[p + 1], src[p + 2]);
		count++;
	}
	return count === 0 ? 0 : sum / count;
}
/**
* Snap a 0-255 mean-luminance value to the centre of one of `buckets`
* equally-spaced bands. With buckets=8 the per-image luminance channel
* carries at most 3 bits; with buckets=4, 2 bits.
*/
function bucketLuma(meanLuma, buckets) {
	if (buckets < 2) return meanLuma;
	return (Math.min(buckets - 1, Math.max(0, Math.floor(meanLuma / 256 * buckets))) + .5) / buckets * 255;
}
/**
* Snap an image's mean luminance to the nearest bucket centre by applying a
* uniform additive offset to every RGB component. The offset is the same for
* every pixel and every channel, so the image's relative chromatic / shape
* content is preserved and only its gross brightness shifts onto the bucket
* grid.
*
* Returns a new ImagePayload --- the caller decides whether to chain it with
* the per-pixel bit-depth scrambler.
*/
function applyMeanLuminanceBucket(image, buckets) {
	if (buckets < 2) return image;
	const current = meanLuminance(image);
	const offset = bucketLuma(current, buckets) - current;
	if (offset === 0) return image;
	const src = image.rgba;
	const out = new Uint8ClampedArray(src.length);
	for (let p = 0; p < src.length; p += 4) {
		out[p] = clamp8(src[p] + offset);
		out[p + 1] = clamp8(src[p + 1] + offset);
		out[p + 2] = clamp8(src[p + 2] + offset);
		out[p + 3] = src[p + 3];
	}
	return {
		width: image.width,
		height: image.height,
		rgba: out,
		exemption: image.exemption
	};
}
function clamp8(v) {
	return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}
//#endregion
//#region extensions/egress-image-scrambler/src/scrambler.ts
const defaultImageScramblerOptions = {
	colorSpace: "rgb",
	depthLevels: 64,
	luminanceBuckets: 8
};
/**
* Apply per-pixel bit-depth requantization and (when configured) per-image
* mean-luminance bucketing. The pixel pass and the luminance pass commute
* for our purposes: we run pixel requantization first so the luminance
* bucketing operates on the already-quantized RGB values, which keeps the
* final bucketing offset honest.
*/
function scrambleImage(image, options) {
	const opts = {
		...defaultImageScramblerOptions,
		...options
	};
	const src = image.rgba;
	const out = new Uint8ClampedArray(src.length);
	const reduce = opts.depthLevels < 256;
	for (let p = 0; p < src.length; p += 4) {
		let r = src[p];
		let g = src[p + 1];
		let b = src[p + 2];
		if (opts.colorSpace === "cmyk") {
			let [c, m, y, k] = rgbToCmyk(r, g, b);
			if (reduce) {
				c = requantizeUnit(c, opts.depthLevels);
				m = requantizeUnit(m, opts.depthLevels);
				y = requantizeUnit(y, opts.depthLevels);
				k = requantizeUnit(k, opts.depthLevels);
			}
			[r, g, b] = cmykToRgb(c, m, y, k);
		} else if (reduce) {
			r = requantize(r, opts.depthLevels);
			g = requantize(g, opts.depthLevels);
			b = requantize(b, opts.depthLevels);
		}
		out[p] = r;
		out[p + 1] = g;
		out[p + 2] = b;
		out[p + 3] = reduce ? requantize(src[p + 3], opts.depthLevels) : src[p + 3];
	}
	const requantized = {
		width: image.width,
		height: image.height,
		rgba: out,
		exemption: image.exemption
	};
	if (opts.luminanceBuckets >= 2) return applyMeanLuminanceBucket(requantized, opts.luminanceBuckets);
	return requantized;
}
//#endregion
//#region extensions/egress-image-scrambler/src/config.ts
function resolveImageScramblerConfig(raw) {
	const r = createPluginConfigReader("egress-image-scrambler", raw, [
		"enabled",
		"colorSpace",
		"colorSpaceRoundtrip",
		"depthLevels",
		"luminanceBuckets"
	]);
	const d = defaultImageScramblerOptions;
	let colorSpace = r.oneOf("colorSpace", ["rgb", "cmyk"], d.colorSpace);
	if (r.has("colorSpaceRoundtrip")) {
		const alias = r.bool("colorSpaceRoundtrip", false) ? "cmyk" : "rgb";
		if (r.has("colorSpace") && alias !== colorSpace) r.fail(`colorSpaceRoundtrip (${alias}) conflicts with colorSpace (${colorSpace})`);
		colorSpace = alias;
	}
	return {
		enabled: r.bool("enabled", true),
		options: {
			colorSpace,
			depthLevels: r.number("depthLevels", d.depthLevels, {
				integer: true,
				min: 2,
				max: d.depthLevels
			}),
			luminanceBuckets: r.number("luminanceBuckets", d.luminanceBuckets, {
				integer: true,
				min: 2,
				max: d.luminanceBuckets
			})
		}
	};
}
//#endregion
//#region extensions/egress-image-scrambler/src/media-scrambler.ts
function applyImageMediaScramble(image, options) {
	if (isMediaExempt({
		kind: "image",
		payload: image
	})) return image;
	return scrambleImage(image, options);
}
//#endregion
export { applyMeanLuminanceBucket as a, pixelLuma as c, requantizeUnit as d, rgbToCmyk as f, scrambleImage as i, cmykToRgb as l, resolveImageScramblerConfig as n, bucketLuma as o, defaultImageScramblerOptions as r, meanLuminance as s, applyImageMediaScramble as t, requantize as u };
