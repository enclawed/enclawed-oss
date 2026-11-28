import { createHash } from "node:crypto";
//#region src/enclawed/adapter/text-cleaner.ts
/**
* Unicode Default_Ignorable_Code_Point (DerivedCoreProperties.txt), Unicode
* 17.0, as inclusive [first, last] ranges, sorted. These render as nothing,
* so a person reading the text cannot see them.
*/
const DEFAULT_IGNORABLE_RANGES = [
	[173, 173],
	[847, 847],
	[1564, 1564],
	[4447, 4448],
	[6068, 6069],
	[6155, 6159],
	[8203, 8207],
	[8234, 8238],
	[8288, 8303],
	[12644, 12644],
	[65024, 65039],
	[65279, 65279],
	[65440, 65440],
	[65520, 65528],
	[113824, 113827],
	[119155, 119162],
	[917504, 921599]
];
/**
* What the model sees in place of content the cleaner could not finish.
* Neutral on purpose: it does not claim to come from Enclawed, whose notices
* reach the model only out of band.
*/
const WITHHELD_MARKER = "[content withheld: too complex to inspect]";
/** What neutralizeNotices puts before a notice-looking "Enclawed". */
const NOTICE_QUOTE = "quoted-";
/** The technique families this cleaner is designed to catch. */
const COVERED = [
	"withheld-region",
	"unicode-tag",
	"lone-surrogate",
	"zero-width-run",
	"variation-selector-run",
	"bidi-control",
	"ansi-conceal",
	"ansi-cursor",
	"ansi-c1",
	"control-overwrite",
	"spoofed-notice",
	"hidden-html"
];
const ZW_RUN = 4;
const VS_RUN = 2;
const MAX_PER_TYPE = 32;
const MAX_ROUNDS = 8;
const NONE = 0;
const TAG = 1;
const VS = 2;
const INVIS = 3;
const BIDI_OVERRIDE = 4;
const BIDI_OPEN = 5;
const BIDI_POP = 6;
const LONE = 7;
const BMP = new Uint8Array(65536);
for (const [a, b] of DEFAULT_IGNORABLE_RANGES) for (let cp = a; cp <= b && cp <= 65535; cp++) BMP[cp] = INVIS;
for (let cp = 65024; cp <= 65039; cp++) BMP[cp] = VS;
for (const cp of [
	6155,
	6156,
	6157,
	6159
]) BMP[cp] = VS;
BMP[8237] = BIDI_OVERRIDE;
BMP[8238] = BIDI_OVERRIDE;
for (const cp of [
	8234,
	8235,
	8294,
	8295,
	8296
]) BMP[cp] = BIDI_OPEN;
BMP[8236] = BIDI_POP;
BMP[8297] = BIDI_POP;
for (let cp = 55296; cp <= 57343; cp++) BMP[cp] = LONE;
const ASTRAL_IGNORABLE = DEFAULT_IGNORABLE_RANGES.filter(([, b]) => b > 65535);
function classOf(cp) {
	if (cp < 65536) return BMP[cp];
	if (cp >= 917504 && cp <= 917631) return TAG;
	if (cp >= 917760 && cp <= 917999) return VS;
	for (const [a, b] of ASTRAL_IGNORABLE) if (cp >= a && cp <= b) return INVIS;
	return NONE;
}
var TooComplex = class extends Error {};
function makeClock(deadline) {
	let n = 0;
	return () => {
		if ((++n & 65535) === 0 && performance.now() > deadline) throw new TooComplex();
	};
}
const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
function decode(units, len) {
	if (LITTLE_ENDIAN) return Buffer.from(units.buffer, units.byteOffset, len * 2).toString("utf16le");
	let s = "";
	for (let i = 0; i < len; i += 8192) s += String.fromCharCode(...units.subarray(i, Math.min(len, i + 8192)));
	return s;
}
function encode(s) {
	const u = new Uint16Array(s.length);
	for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
	return u;
}
function isAscii(s) {
	return Buffer.byteLength(s, "utf8") === s.length;
}
/** Number of code points in a string (no intermediate array). */
function codePointLength(s) {
	let n = s.length;
	for (let i = 0; i + 1 < s.length; i++) {
		const c = s.charCodeAt(i);
		if (c >= 55296 && c <= 56319) {
			const d = s.charCodeAt(i + 1);
			if (d >= 56320 && d <= 57343) {
				n--;
				i++;
			}
		}
	}
	return n;
}
const CURSOR_FINALS = new Set(Array.from("ABCDEFGHJKfsu").map((c) => c.charCodeAt(0)));
function applySgr(buf, from, to, concealed) {
	const priv = from < to && buf[from] >= 60 && buf[from] <= 63;
	const vals = [];
	const colon = [];
	let v = 0;
	let hasColon = false;
	for (let p = from; p <= to; p++) {
		const c = p < to ? buf[p] : 59;
		if (c >= 48 && c <= 57) {
			if (!hasColon && v < 1e5) v = v * 10 + (c - 48);
		} else if (c === 58) hasColon = true;
		else if (c === 59) {
			vals.push(v);
			colon.push(hasColon);
			v = 0;
			hasColon = false;
		}
	}
	let sawConceal = false;
	for (let k = 0; k < vals.length; k++) {
		const x = vals[k];
		if (!colon[k] && (x === 38 || x === 48 || x === 58)) {
			const mode = vals[k + 1];
			k += mode === 5 ? 2 : mode === 2 ? 4 : 0;
			continue;
		}
		if (x === 8) {
			concealed = true;
			sawConceal = true;
		} else if ((x === 0 || x === 28) && !priv) concealed = false;
	}
	return {
		concealed,
		sawConceal
	};
}
let scratch = new Uint32Array(256);
function overwriteLine(buf, from, to) {
	let end = to;
	const crlf = end > from && buf[end - 1] === 13;
	if (crlf) end--;
	if (scratch.length < end - from) scratch = new Uint32Array(Math.max(end - from, scratch.length * 2));
	let col = 0;
	let width = 0;
	for (let q = from; q < end; q++) {
		const c = buf[q];
		if (c === 13) {
			col = 0;
			continue;
		}
		if (c === 8) {
			if (col > 0) col--;
			continue;
		}
		let cp = c;
		if (c >= 55296 && c <= 56319 && q + 1 < end && buf[q + 1] >= 56320 && buf[q + 1] <= 57343) {
			cp = (c - 55296 << 10) + (buf[q + 1] - 56320) + 65536;
			q++;
		}
		scratch[col++] = cp;
		if (col > width) width = col;
	}
	let w = from;
	for (let k = 0; k < width; k++) {
		const cp = scratch[k];
		if (cp > 65535) {
			buf[w++] = 55296 + (cp - 65536 >> 10);
			buf[w++] = 56320 + (cp - 65536 & 1023);
		} else buf[w++] = cp;
	}
	if (crlf) buf[w++] = 13;
	return w;
}
const isC1String = (c) => c === 144 || c === 152 || c === 157 || c === 158 || c === 159;
const isStringIntro = (x) => x === 93 || x === 80 || x === 88 || x === 94 || x === 95;
function renderUnits(src, len, tick) {
	let out = new Uint16Array(len);
	let r = 0;
	let concealed = false;
	let conceal = -1;
	let cursor = -1;
	let ctrl = -1;
	let c1 = -1;
	let unterminated = false;
	let lineStart = 0;
	let lineOverwrite = false;
	const flushLine = () => {
		r = overwriteLine(out, lineStart, r);
	};
	let k = 0;
	while (k < len) {
		tick();
		const c = src[k];
		const popEsc = c !== 27 && !concealed && r > lineStart && out[r - 1] === 27;
		const csi = c === 27 && k + 1 < len && src[k + 1] === 91 ? k + 2 : c === 155 ? k + 1 : popEsc && c === 91 ? k + 1 : -1;
		if (csi >= 0) {
			let p = csi;
			while (p < len && src[p] >= 48 && src[p] <= 63) p++;
			const paramsEnd = p;
			while (p < len && src[p] >= 32 && src[p] <= 47) p++;
			if (p < len && src[p] >= 64 && src[p] <= 126) {
				const fin = src[p];
				if (c === 155 && c1 < 0) c1 = r;
				if (fin === 109 && paramsEnd === p) {
					const s = applySgr(src, csi, paramsEnd, concealed);
					concealed = s.concealed;
					if (s.sawConceal && conceal < 0) conceal = r;
				} else if (CURSOR_FINALS.has(fin) && cursor < 0) cursor = r;
				if (popEsc && c === 91) r--;
				k = p + 1;
				continue;
			}
		} else {
			let body = -1;
			let osc = false;
			if (c === 27 && k + 1 < len) {
				const nx = src[k + 1];
				if (isStringIntro(nx)) {
					body = k + 2;
					osc = nx === 93;
				}
			} else if (popEsc && isStringIntro(c)) {
				body = k + 1;
				osc = c === 93;
				r--;
			} else if (isC1String(c)) {
				body = k + 1;
				osc = c === 157;
				if (c1 < 0) c1 = r;
			}
			if (body >= 0) {
				let p = body;
				let end = -1;
				while (p < len) {
					const d = src[p];
					if (osc && d === 7) {
						end = p + 1;
						break;
					}
					if (d === 156) {
						end = p + 1;
						break;
					}
					if (d === 27 && p + 1 < len && src[p + 1] === 92) {
						end = p + 2;
						break;
					}
					p++;
					tick();
				}
				if (end < 0) {
					unterminated = true;
					if (conceal < 0) conceal = r;
					k = len;
					break;
				}
				k = end;
				continue;
			}
		}
		if (concealed) {
			k++;
			continue;
		}
		if (c === 10 || c === 11 || c === 12) {
			if (c !== 10 && ctrl < 0) ctrl = r;
			if (lineOverwrite) flushLine();
			lineOverwrite = false;
			out[r++] = 10;
			lineStart = r;
			k++;
			continue;
		}
		if (c === 8) {
			if (ctrl < 0) ctrl = r;
			lineOverwrite = true;
		} else if (c === 13 && !(k + 1 < len && src[k + 1] === 10)) lineOverwrite = true;
		if (r >= out.length) {
			const grown = new Uint16Array(out.length * 2 + 16);
			grown.set(out);
			out = grown;
		}
		out[r++] = c;
		k++;
	}
	if (lineOverwrite) flushLine();
	return {
		out,
		len: r,
		conceal,
		cursor,
		ctrl,
		c1,
		unterminated
	};
}
/** Does s hold anything renderUnits changes (ESC, CR, BS, VT, FF, or an 8-bit C1 introducer)? */
function needsRender(s) {
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		if (c === 8 || c === 11 || c === 12 || c === 13 || c === 27 || c === 144 || c === 152 || c === 155 || c >= 157 && c <= 159) return true;
	}
	return false;
}
const INSTRUCTION_WORDS = new Set([
	"ignore",
	"instead",
	"must",
	"should",
	"delete",
	"remove",
	"run",
	"curl",
	"wget",
	"rm",
	"write",
	"overwrite",
	"replace",
	"reset",
	"execute",
	"exec",
	"tool",
	"agent",
	"assistant",
	"system",
	"prompt",
	"hook",
	"settings",
	"config",
	"token",
	"secret",
	"password",
	"credential",
	"disable",
	"enable",
	"fetch",
	"send",
	"post",
	"upload",
	"download",
	"install",
	"chmod"
]);
const DOTTED = [
	".env",
	".git",
	".claude",
	".mcp"
];
const MAX_WORD = Math.max(...[...INSTRUCTION_WORDS].map((w) => w.length));
const WORDS_BY_LENGTH = [];
for (const w of INSTRUCTION_WORDS) (WORDS_BY_LENGTH[w.length] ??= []).push(w);
const WORD_UNIT = new Uint8Array(128);
for (const ch of "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_") WORD_UNIT[ch.charCodeAt(0)] = 1;
const isWordUnit = (c) => c < 128 && WORD_UNIT[c] === 1;
const lowerAscii = (c) => c >= 65 && c <= 90 ? c + 32 : c;
const isJsSpace = (c) => c >= 9 && c <= 13 || c === 32 || c === 160 || c === 5760 || c >= 8192 && c <= 8202 || c === 8232 || c === 8233 || c === 8239 || c === 8287 || c === 12288 || c === 65279;
function matchCI(text, pos, needle) {
	if (pos + needle.length > text.length) return false;
	for (let q = 0; q < needle.length; q++) if (lowerAscii(text.charCodeAt(pos + q)) !== needle.charCodeAt(q)) return false;
	return true;
}
function readsLikeInstruction(text, from, to, tick) {
	let p = from;
	while (p < to) {
		tick();
		let c = text.charCodeAt(p);
		while (p < to && !isWordUnit(c)) {
			if (c === 46) {
				for (const sub of DOTTED) if (p + sub.length <= to && matchCI(text, p, sub)) return true;
			}
			c = ++p < to ? text.charCodeAt(p) : 0;
		}
		const ws = p;
		while (p < to && isWordUnit(text.charCodeAt(p))) p++;
		const len = p - ws;
		const words = len <= MAX_WORD ? WORDS_BY_LENGTH[len] : void 0;
		if (words) {
			for (const word of words) if (matchCI(text, ws, word)) return true;
		}
		for (let q = ws; q + 5 <= (len >= 5 ? p : 0); q++) if (text.charCodeAt(q + 3) === 95 && text.charCodeAt(q + 4) === 95 && matchCI(text, q, "mcp__")) return true;
	}
	return false;
}
const STYLE_HIDING = [
	"display:none",
	"font-size:0",
	"visibility:hidden",
	"color:fff",
	"color:#fff",
	"color:white"
];
function cssHides(text, from, to, tick) {
	let css = "";
	let pending = "";
	for (let p = from; p < to; p++) {
		tick();
		const c = text.charCodeAt(p);
		if (c === 58) {
			css += ":";
			pending = "";
			while (p + 1 < to && isJsSpace(text.charCodeAt(p + 1))) p++;
			continue;
		}
		if (isJsSpace(c)) {
			pending += String.fromCharCode(c);
			continue;
		}
		css += pending + String.fromCharCode(lowerAscii(c));
		pending = "";
	}
	return STYLE_HIDING.some((h) => css.includes(h));
}
function closeDetails(text, from, tick) {
	for (let p = text.indexOf("</", from); p >= 0; p = text.indexOf("</", p + 2)) {
		tick();
		if (matchCI(text, p, "</details>")) return p;
	}
	return -1;
}
function hiddenHtml(text, add, tick) {
	let p = 0;
	for (;;) {
		const s = text.indexOf("<!--", p);
		if (s < 0) break;
		const e = text.indexOf("-->", s + 4);
		if (e < 0) break;
		if (readsLikeInstruction(text, s + 4, e, tick)) {
			add("hidden-html", s, e - s - 4, "comment");
			break;
		}
		p = e + 3;
	}
	const cache = /* @__PURE__ */ new Map();
	const nextAt = (ch, from) => {
		let at = cache.get(ch);
		if (at === void 0 || at >= 0 && at < from) {
			at = text.indexOf(ch, from);
			cache.set(ch, at);
		}
		return at < 0 ? text.length : at;
	};
	for (let e = text.indexOf("="); e >= 0; e = text.indexOf("=", e + 1)) {
		tick();
		let k = e - 1;
		while (k >= 0 && isJsSpace(text.charCodeAt(k))) k--;
		if (k < 4 || !matchCI(text, k - 4, "style")) continue;
		let q = e + 1;
		while (q < text.length && isJsSpace(text.charCodeAt(q))) q++;
		const quote = text.charCodeAt(q);
		if (quote !== 34 && quote !== 39) continue;
		const v = Math.min(nextAt("\"", q + 1), nextAt("'", q + 1));
		if (nextAt(":", q + 1) < v && cssHides(text, q + 1, v, tick)) {
			add("hidden-html", k - 4, 1, "zero-size/transparent text");
			break;
		}
	}
	p = 0;
	for (;;) {
		const s = text.indexOf("<", p);
		if (s < 0) break;
		tick();
		const after = text.charCodeAt(s + 8);
		if (!matchCI(text, s, "<details") || !(after === 62 || isJsSpace(after))) {
			p = s + 1;
			continue;
		}
		const close = closeDetails(text, s + 9, tick);
		const end = close < 0 ? text.length : close + 10;
		if (readsLikeInstruction(text, s, end, tick)) {
			add("hidden-html", s, 1, "details");
			break;
		}
		if (close < 0) break;
		p = end;
	}
}
const NOTICE_WORD = "enclawed";
const CONFUSABLE = new Map(Object.entries({
	а: "a",
	в: "b",
	е: "e",
	ё: "e",
	є: "e",
	к: "k",
	м: "m",
	н: "h",
	о: "o",
	р: "p",
	с: "c",
	т: "t",
	у: "y",
	х: "x",
	ѕ: "s",
	і: "i",
	ї: "i",
	ј: "j",
	ԁ: "d",
	һ: "h",
	ӏ: "l",
	ԛ: "q",
	ԝ: "w",
	ɡ: "g",
	ɩ: "i",
	ґ: "r",
	ѵ: "v",
	ѡ: "w",
	ш: "w",
	α: "a",
	β: "b",
	ε: "e",
	η: "n",
	ι: "i",
	κ: "k",
	ν: "v",
	ο: "o",
	ρ: "p",
	τ: "t",
	υ: "u",
	χ: "x",
	ω: "w",
	ϲ: "c",
	ϳ: "j",
	γ: "y",
	μ: "u",
	ı: "i",
	ȷ: "j",
	ɑ: "a",
	ɛ: "e",
	ɔ: "c",
	ⅼ: "l",
	ℓ: "l",
	ǀ: "l",
	ʀ: "r",
	ɪ: "i",
	ᴀ: "a",
	ᴄ: "c",
	ᴇ: "e",
	ᴏ: "o",
	ᴡ: "w",
	ɴ: "n",
	ʟ: "l",
	Ꭱ: "r",
	Ꮃ: "w",
	Ꮟ: "b",
	Ꭵ: "i",
	"∶": ":",
	"꞉": ":",
	"˸": ":",
	"։": ":",
	"׃": ":",
	"⁚": ":",
	"︓": ":",
	"﹕": ":",
	"፡": ":",
	"〕": "]",
	"⟧": "]",
	"⦌": "]",
	"⌉": "]",
	"⌋": "]"
}));
const CONFUSABLE_UPPER = new Map(Object.entries({
	Η: "h",
	Ν: "n",
	Μ: "m",
	Β: "b",
	Ζ: "z",
	Ρ: "p",
	Χ: "x",
	Υ: "y",
	В: "b",
	Н: "h",
	М: "m",
	Р: "p",
	Х: "x",
	У: "y",
	Т: "t",
	К: "k"
}));
const COMBINING = /\p{M}/gu;
const UNICODE_SPACE = /^[\p{Zs}\t]$/u;
const skelCache = /* @__PURE__ */ new Map();
function skeletonOf(ch) {
	const cached = skelCache.get(ch);
	if (cached !== void 0) return cached;
	let v;
	const upper = CONFUSABLE_UPPER.get(ch);
	if (UNICODE_SPACE.test(ch)) v = " ";
	else if (upper !== void 0) v = upper;
	else {
		let out = "";
		for (const c of ch.normalize("NFKD").replace(COMBINING, "")) {
			const cp = c.codePointAt(0) ?? 0;
			if (classOf(cp) !== NONE) continue;
			if (cp < 128) {
				out += c.toLowerCase();
				continue;
			}
			const up = CONFUSABLE_UPPER.get(c);
			if (up !== void 0) {
				out += up;
				continue;
			}
			const l = c.toLowerCase();
			out += CONFUSABLE.get(l) ?? CONFUSABLE.get(c) ?? l;
		}
		v = out;
	}
	if (skelCache.size < 8192) skelCache.set(ch, v);
	return v;
}
const isEmphasis = (c) => c === 42 || c === 95 || c === 96 || c === 126;
const SKEL_BMP = new Int32Array(65536).fill(-1);
for (let c = 0; c < 128; c++) SKEL_BMP[c] = isEmphasis(c) ? -2 : c === 9 ? 32 : c >= 65 && c <= 90 ? c + 32 : c;
/**
* The skeleton of `s`: what a reader sees, as lowercase Latin with look-alikes
* folded, combining marks, invisibles and Markdown emphasis dropped, runs of
* spaces collapsed. `map[i]` is the index in `s` skeleton character i came
* from. Linear.
*/
function skeleton(s, tick = () => {}) {
	let buf = new Uint16Array(s.length + 64);
	let map = new Int32Array(s.length + 64);
	let n = 0;
	let space = false;
	const push = (u, at) => {
		if (n >= buf.length) {
			const nb = new Uint16Array(buf.length * 2);
			nb.set(buf);
			buf = nb;
			const nm = new Int32Array(map.length * 2);
			nm.set(map);
			map = nm;
		}
		buf[n] = u;
		map[n++] = at;
	};
	for (let i = 0; i < s.length;) {
		tick();
		const c = s.charCodeAt(i);
		let v;
		let w = 1;
		let multi = "";
		if (c < 55296 || c > 57343) {
			v = SKEL_BMP[c];
			if (v === -1) {
				const str = skeletonOf(String.fromCharCode(c));
				v = str.length === 0 ? -2 : str.length === 1 ? str.charCodeAt(0) : -3;
				SKEL_BMP[c] = v;
			}
			if (v === -3) multi = skeletonOf(String.fromCharCode(c));
		} else {
			const cp = s.codePointAt(i) ?? c;
			w = cp > 65535 ? 2 : 1;
			multi = skeletonOf(String.fromCodePoint(cp));
			v = -3;
		}
		if (v === -2) {
			i += w;
			continue;
		}
		if (v >= 0) {
			if (v === 32) {
				if (!space) push(32, i);
				space = true;
			} else {
				space = false;
				push(v, i);
			}
			i += w;
			continue;
		}
		for (let k = 0; k < multi.length; k++) {
			const u = multi.charCodeAt(k);
			if (u === 32) {
				if (space) continue;
				space = true;
			} else space = false;
			push(u, i);
		}
		i += w;
	}
	return {
		skel: decode(buf, n),
		map: map.subarray(0, n)
	};
}
const ASCII_WORD = /e[*_`~]*n[*_`~]*c[*_`~]*l[*_`~]*a[*_`~]*w[*_`~]*e[*_`~]*d/i;
function quotedBefore(s, o) {
	let b = o - 1;
	while (b >= 0 && (s.charCodeAt(b) === 42 || s.charCodeAt(b) === 95)) b--;
	if (b >= 0 && s.charCodeAt(b) === 91) b--;
	const c = b >= 0 ? s.charCodeAt(b) : 0;
	return c === 96 || c === 34 || c === 39;
}
function codeSpanTracker(s) {
	let ls = 0;
	let pos = 0;
	let before = 0;
	let firstLineTotal = -1;
	return (o) => {
		for (; pos < o; pos++) {
			const c = s.charCodeAt(pos);
			if (c === 10) {
				ls = pos + 1;
				before = 0;
			} else if (c === 96) before++;
		}
		if (before % 2 === 1) return true;
		if (ls !== 0) return false;
		if (firstLineTotal < 0) {
			let le = s.indexOf("\n");
			if (le < 0) le = s.length;
			firstLineTotal = 0;
			for (let k = 0; k < le; k++) if (s.charCodeAt(k) === 96) firstLineTotal++;
		}
		return (firstLineTotal - before) % 2 === 1;
	};
}
const isHexSkel = (c) => c >= 48 && c <= 57 || c >= 97 && c <= 102;
/**
* Text that imitates a notice from Enclawed, matched on the skeleton anywhere
* in a line: "enclawed", optional space, an optional hex token of 4 or more
* characters, optional space, then ":" (or "]" after a token). Each match gets
* NOTICE_QUOTE before the word in the original text. A plain quoted or
* inline-code "Enclawed:" (documentation of the format) is left alone. Linear.
*/
function neutralizeNotices(s, tick = () => {}) {
	if (s.length < 8) return {
		text: s,
		at: -1,
		count: 0
	};
	const asciiOnly = isAscii(s);
	if (asciiOnly && !ASCII_WORD.test(s)) return {
		text: s,
		at: -1,
		count: 0
	};
	const { skel, map } = asciiOnly && !/[*_`~\t]| {2}/.test(s) ? {
		skel: s.toLowerCase(),
		map: null
	} : skeleton(s, tick);
	const inCode = codeSpanTracker(s);
	let out = "";
	let last = 0;
	let at = -1;
	let count = 0;
	for (let i = skel.indexOf(NOTICE_WORD); i >= 0; i = skel.indexOf(NOTICE_WORD, i + 8)) {
		tick();
		let f = i + 8;
		if (skel.charCodeAt(f) === 32) f++;
		const hexFrom = f;
		while (f < skel.length && f - hexFrom <= 64 && isHexSkel(skel.charCodeAt(f))) f++;
		const tagged = f - hexFrom >= 4;
		if (f > hexFrom && !tagged) continue;
		if (skel.charCodeAt(f) === 32) f++;
		const c = skel.charCodeAt(f);
		if (!(c === 58 || c === 93 && tagged)) continue;
		const o = map ? map[i] : i;
		if (o < last || o >= 7 && s.slice(o - 7, o) === "quoted-") continue;
		const before = i > 0 ? skel.charCodeAt(i - 1) : 32;
		if (before >= 97 && before <= 122 || before >= 48 && before <= 57 || before === 46 || before === 47 || before === 92) continue;
		if (!tagged && (quotedBefore(s, o) || inCode(o))) continue;
		if (at < 0) at = o;
		count++;
		out += `${s.slice(last, o)}${NOTICE_QUOTE}`;
		last = o;
	}
	return count === 0 ? {
		text: s,
		at: -1,
		count: 0
	} : {
		text: out + s.slice(last),
		at,
		count
	};
}
const JOINING_SCRIPT = /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Nko}\p{Script=Mongolian}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Oriya}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Sinhala}\p{Script=Myanmar}\p{Script=Khmer}\p{Script=Tibetan}\p{Script=Thai}\p{Script=Lao}\p{Script=Balinese}\p{Script=Javanese}]/u;
const WORD_BREAK_SCRIPT = /[\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\p{Script=Tibetan}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Javanese}\p{Script=Balinese}]/u;
const PICTO = /\p{Extended_Pictographic}/u;
const LETTER = /[\p{L}\p{M}\p{N}]/u;
const isEmojiModifier = (cp) => cp >= 127995 && cp <= 127999;
function cpBefore(text, at) {
	if (at <= 0) return -1;
	const lo = text.charCodeAt(at - 1);
	if (lo >= 56320 && lo <= 57343 && at >= 2) {
		const hi = text.charCodeAt(at - 2);
		if (hi >= 55296 && hi <= 56319) return (hi - 55296 << 10) + (lo - 56320) + 65536;
	}
	return lo;
}
function legitInContext(text, i, j, c, cpAt) {
	const prev = cpBefore(text, i);
	if (prev < 0) return false;
	const prevCls = classOf(prev);
	const p = String.fromCodePoint(prev);
	if (c === 65038 || c === 65039) return prevCls === NONE && (PICTO.test(p) || /^[0-9#*]$/.test(p));
	if (c >= 65024 && c <= 65037) return prevCls === NONE && prev > 127 && /^[\p{L}\p{S}\p{N}]$/u.test(p);
	const cp = c >= 55296 && c <= 56319 ? text.codePointAt(i) ?? c : c;
	if (cp >= 917760 && cp <= 917999) return prevCls === NONE && /\p{Script=Han}/u.test(p);
	if (cp === 6155 || cp === 6156 || cp === 6157 || cp === 6159) return /\p{Script=Mongolian}/u.test(p);
	const next = j < text.length ? cpAt(j) : -1;
	if (next < 0) return false;
	const nx = String.fromCodePoint(next);
	const nextCls = classOf(next);
	if (cp === 8205 && (PICTO.test(p) || isEmojiModifier(prev) || prev === 65039) && PICTO.test(nx)) return true;
	if (cp === 8204 || cp === 8205) return prevCls === NONE && nextCls === NONE && JOINING_SCRIPT.test(p) && JOINING_SCRIPT.test(nx);
	if (cp === 8203) return prevCls === NONE && nextCls === NONE && WORD_BREAK_SCRIPT.test(p) && WORD_BREAK_SCRIPT.test(nx);
	if (cp === 173 || cp === 8288) return prevCls === NONE && nextCls === NONE && LETTER.test(p) && LETTER.test(nx);
	return false;
}
function stripInvisible(text, add, tick) {
	const n = text.length;
	const keep = new Uint16Array(n);
	let o = 0;
	let removedAny = false;
	let cpIndex = 0;
	let opens = 0;
	let unbalanced = false;
	let i = 0;
	let width = 1;
	const cpAt = (at) => {
		const c = text.charCodeAt(at);
		if (c >= 55296 && c <= 56319 && at + 1 < n) {
			const d = text.charCodeAt(at + 1);
			if (d >= 56320 && d <= 57343) {
				width = 2;
				return (c - 55296 << 10) + (d - 56320) + 65536;
			}
		}
		width = 1;
		return c;
	};
	while (i < n) {
		tick();
		let c = text.charCodeAt(i);
		if (c < 173) {
			const from = i;
			do {
				keep[o++] = c;
				c = ++i < n ? text.charCodeAt(i) : 65535;
			} while (c < 173);
			cpIndex += i - from;
			continue;
		}
		let cls;
		if (c < 55296 || c > 57343) {
			cls = BMP[c];
			width = 1;
		} else cls = classOf(cpAt(i));
		if (cls === NONE) {
			keep[o++] = c;
			if (width === 2) keep[o++] = text.charCodeAt(i + 1);
			i += width;
			cpIndex++;
			continue;
		}
		if (cls === TAG || cls === VS || cls === INVIS || cls === LONE) {
			const start = cpIndex;
			let count = 0;
			let j = i;
			while (j < n) {
				tick();
				if (classOf(cpAt(j)) !== cls) break;
				j += width;
				count++;
			}
			if (count === 1 && (cls === INVIS || cls === VS) && legitInContext(text, i, j, c, cpAt)) {
				for (let q = i; q < j; q++) keep[o++] = text.charCodeAt(q);
				cpIndex++;
				i = j;
				continue;
			}
			if (cls === TAG) add("unicode-tag", start, count);
			else if (cls === LONE) add("lone-surrogate", start, count);
			else if (cls === VS && count >= VS_RUN) add("variation-selector-run", start, count);
			else if (cls === INVIS && count >= ZW_RUN) add("zero-width-run", start, count);
			removedAny = true;
			cpIndex += count;
			i = j;
			continue;
		}
		if (cls === BIDI_OVERRIDE) {
			add("bidi-control", cpIndex, 1, "override (LRO/RLO)");
			removedAny = true;
		} else {
			if (cls === BIDI_OPEN) opens++;
			else if (--opens < 0) {
				unbalanced = true;
				opens = 0;
			}
			keep[o++] = c;
		}
		i += width;
		cpIndex++;
	}
	if (unbalanced || opens > 0) {
		add("bidi-control", -1, opens, "unbalanced embedding/isolate");
		let w = 0;
		for (let q = 0; q < o; q++) {
			tick();
			const cls = BMP[keep[q]];
			if (cls !== BIDI_OPEN && cls !== BIDI_POP) keep[w++] = keep[q];
		}
		o = w;
		removedAny = true;
	}
	return {
		keep,
		o,
		removedAny
	};
}
function cleanRound(text, add, tick) {
	const n = text.length;
	const ascii = isAscii(text);
	let keep = null;
	let o = 0;
	let removedAny = false;
	if (!ascii) ({keep, o, removedAny} = stripInvisible(text, add, tick));
	let clean;
	if (!removedAny && !needsRender(text)) clean = text;
	else {
		if (keep === null) {
			keep = encode(text);
			o = n;
		}
		const r = renderUnits(keep, o, tick);
		if (r.conceal >= 0) add("ansi-conceal", r.conceal, 1, r.unterminated ? "unterminated escape string" : void 0);
		if (r.cursor >= 0) add("ansi-cursor", r.cursor, 1);
		if (r.ctrl >= 0) add("control-overwrite", r.ctrl, 1, "backspace, vertical tab or form feed");
		if (r.c1 >= 0) add("ansi-c1", r.c1, 1, "8-bit C1 escape");
		clean = decode(r.out, r.len);
		if (clean === text) clean = text;
	}
	const nn = neutralizeNotices(clean, tick);
	if (nn.count > 0) {
		add("spoofed-notice", nn.at, nn.count);
		clean = nn.text;
	}
	return clean;
}
function withholdRegion(clean, next, add, tick) {
	let p = 0;
	const max = Math.min(clean.length, next.length);
	while (p < max && clean.charCodeAt(p) === next.charCodeAt(p)) p++;
	let q = 0;
	while (q < max - p && clean.charCodeAt(clean.length - 1 - q) === next.charCodeAt(next.length - 1 - q)) q++;
	const from = p === 0 ? 0 : clean.lastIndexOf("\n", p - 1) + 1;
	const nl = clean.indexOf("\n", Math.max(from, clean.length - q - 1));
	const to = nl < 0 ? clean.length : nl;
	const out = `${clean.slice(0, from)}${WITHHELD_MARKER}${clean.slice(to)}`;
	if (cleanRound(out, () => {}, tick) !== out) throw new TooComplex("no fixed point");
	add("withheld-region", from, to - from, "no fixed point");
	return out;
}
function scan(text, tick, deadline, maxRounds) {
	if (performance.now() > deadline) throw new TooComplex();
	const findings = [];
	const perType = /* @__PURE__ */ new Map();
	const add = (type, index, count, note) => {
		const k = perType.get(type) ?? 0;
		if (k < MAX_PER_TYPE) {
			perType.set(type, k + 1);
			findings.push({
				type,
				index,
				count,
				...note ? { note } : {}
			});
		}
	};
	let clean = text;
	for (let round = 0;; round++) {
		const next = cleanRound(clean, add, tick);
		if (next === clean) break;
		if (round + 1 >= maxRounds) {
			clean = withholdRegion(clean, next, add, tick);
			break;
		}
		clean = next;
	}
	hiddenHtml(text, add, tick);
	if (performance.now() > deadline) throw new TooComplex();
	return {
		clean,
		findings
	};
}
/** The fail-safe result for a payload that is not inspected. */
function withheldResult(text, note = "time budget exceeded") {
	return {
		clean: WITHHELD_MARKER,
		findings: [{
			type: "too-complex",
			index: 0,
			count: typeof text === "string" ? text.length : 0,
			note
		}],
		withheld: true
	};
}
/**
* Clean one string. On budget exhaustion `clean` is WITHHELD_MARKER and the
* single finding is "too-complex": the content is never passed through.
*/
function cleanText(text, opts = {}) {
	if (typeof text !== "string") return {
		clean: "",
		findings: []
	};
	const budgetMs = opts.budgetMs ?? 1e3;
	const deadline = Math.min(performance.now() + budgetMs, opts.deadline ?? Infinity);
	try {
		return scan(text, makeClock(deadline), deadline, opts.maxRounds ?? MAX_ROUNDS);
	} catch (err) {
		if (err instanceof TooComplex) return withheldResult(text, err.message || void 0);
		throw err;
	}
}
/** Strip invisible and bidi code points; returns the visible text and how many were removed. */
function stripHidden(s) {
	let out = "";
	let removed = 0;
	for (const ch of s) {
		const cp = ch.codePointAt(0) ?? 0;
		if (classOf(cp) !== NONE || cp === 8206 || cp === 8207 || cp === 1564) removed++;
		else out += ch;
	}
	return {
		text: out,
		removed
	};
}
/**
* The text of a value from outside Enclawed (a hook payload, a settings
* file, a record, a thrown value). A string is itself; a number, boolean,
* bigint, null or undefined reads as String() reads it; a symbol as its
* description form; an Error as "Name: message". Any other object is
* serialized deliberately as JSON (a function, or a value JSON cannot
* hold, as its type tag), never as "[object Object]", so two different
* objects never read as the same text.
*/
function textOf(value) {
	switch (typeof value) {
		case "string": return value;
		case "number":
		case "boolean":
		case "bigint":
		case "undefined": return String(value);
		case "symbol": return value.toString();
		default: break;
	}
	if (value === null) return "null";
	if (value instanceof Error) return String(value);
	try {
		const json = JSON.stringify(value);
		if (json !== void 0) return json;
	} catch {}
	return Object.prototype.toString.call(value);
}
function escapeUnit(c) {
	return `\\u${c.toString(16).padStart(4, "0")}`;
}
function jsonQuote(s) {
	const j = JSON.stringify(s);
	let out = "";
	for (let i = 0; i < j.length; i++) {
		const c = j.charCodeAt(i);
		out += c >= 127 && c <= 159 || c === 8232 || c === 8233 || c === 65532 || c === 65533 ? escapeUnit(c) : j[i];
	}
	return out;
}
/** One agent-controlled value, rendered for Enclawed's own messages: a JSON string literal, possibly with a note. */
function quoteUntrusted(value, opts = {}) {
	const max = opts.max ?? 200;
	const raw = value === void 0 ? "" : textOf(value);
	const { text, removed } = stripHidden(raw);
	const visible = neutralizeNotices(text).text;
	const cps = Array.from(visible);
	let shown = visible;
	let cut = "";
	if (cps.length > max) {
		shown = `${cps.slice(0, max).join("")}…`;
		cut = `${cps.length} characters, sha256 ${createHash("sha256").update(raw).digest("hex").slice(0, 12)}`;
	}
	const notes = [cut, removed ? `${removed} hidden character${removed === 1 ? "" : "s"} removed` : ""].filter(Boolean);
	return `${jsonQuote(shown)}${notes.length ? ` (${notes.join("; ")})` : ""}`;
}
/** A path Enclawed computed: bare when it is plain printable ASCII, quoted otherwise. */
function showPath(p) {
	const s = textOf(p ?? "");
	let plain = s.length > 0 && !s.includes("\"");
	for (let i = 0; plain && i < s.length; i++) {
		const c = s.charCodeAt(i);
		plain = c >= 33 && c <= 126;
	}
	return plain ? s : quoteUntrusted(s, { max: 400 });
}
/**
* Free text that mixes Enclawed's wording with values from elsewhere (an
* error message): hidden characters stripped, controls and newlines escaped,
* notice imitations neutralized, length capped. Not quoted.
*/
function sanitizeText(value, opts = {}) {
	const max = opts.max ?? 600;
	const { text } = stripHidden(textOf(value ?? ""));
	const base = opts.neutralize === false ? text : neutralizeNotices(text).text;
	let t = "";
	for (let i = 0; i < base.length; i++) {
		const c = base.charCodeAt(i);
		if (c === 10) t += "\\n";
		else if (c === 9) t += " ";
		else if (c <= 31 || c >= 127 && c <= 159 || c === 8232 || c === 8233) t += escapeUnit(c);
		else t += base[i];
	}
	const cps = Array.from(t);
	if (cps.length > max) t = `${cps.slice(0, max).join("")}… (${cps.length} characters)`;
	return t;
}
//#endregion
export { COVERED as a, cleanText as c, withheldResult as d, textOf as i, codePointLength as l, sanitizeText as n, NOTICE_QUOTE as o, showPath as r, WITHHELD_MARKER as s, quoteUntrusted as t, neutralizeNotices as u };
