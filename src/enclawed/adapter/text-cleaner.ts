// enclawed adapter kit: the text cleaner. Strips or flags the hidden channels
// in text an agent reads that a person looking at the rendered text cannot
// see: Unicode tag characters, runs of invisible (Default_Ignorable) code
// points, variation-selector runs, bidi overrides and unbalanced isolates,
// lone surrogates, terminal escapes that conceal text or move the cursor over
// it, carriage-return and backspace overwrites, and text that imitates a
// notice from Enclawed. Hidden HTML that reads like an instruction (comments,
// <details>, zero-size or transparent text) is visible markup, so it is
// flagged, not deleted.
//
// Ported from codenclawed's preprocess.mjs (the cleaner its stego suite
// measures), so every adapter cleans the same way. Pure: cleanText(text) ->
// { clean, findings }.
//
// Cost: every scan is one linear pass (indexOf or a hand-written state
// machine; no regular expression runs over the input), so a crafted payload
// cannot make it quadratic. A wall-clock budget backs that up: past it the
// cleaner fails SAFE and returns WITHHELD_MARKER instead of the content, never
// the content uncleaned.
//
// Out of scope by design: base64/rot13, homoglyph text that is not a notice
// imitation, and payloads split across files. The action gate decides on what
// the agent then tries to do, whatever the channel.

/**
 * Unicode Default_Ignorable_Code_Point (DerivedCoreProperties.txt), Unicode
 * 17.0, as inclusive [first, last] ranges, sorted. These render as nothing,
 * so a person reading the text cannot see them.
 */
export const DEFAULT_IGNORABLE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00ad, 0x00ad],
  [0x034f, 0x034f],
  [0x061c, 0x061c],
  [0x115f, 0x1160],
  [0x17b4, 0x17b5],
  [0x180b, 0x180f],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x206f],
  [0x3164, 0x3164],
  [0xfe00, 0xfe0f],
  [0xfeff, 0xfeff],
  [0xffa0, 0xffa0],
  [0xfff0, 0xfff8],
  [0x1bca0, 0x1bca3],
  [0x1d173, 0x1d17a],
  [0xe0000, 0xe0fff],
];

/**
 * What the model sees in place of content the cleaner could not finish.
 * Neutral on purpose: it does not claim to come from Enclawed, whose notices
 * reach the model only out of band.
 */
export const WITHHELD_MARKER = "[content withheld: too complex to inspect]";
/** What neutralizeNotices puts before a notice-looking "Enclawed". */
export const NOTICE_QUOTE = "quoted-";
export const DEFAULT_BUDGET_MS = 1000;

export type CleanerFindingType =
  | "unicode-tag"
  | "lone-surrogate"
  | "zero-width-run"
  | "variation-selector-run"
  | "bidi-control"
  | "ansi-conceal"
  | "ansi-cursor"
  | "ansi-c1"
  | "control-overwrite"
  | "spoofed-notice"
  | "hidden-html"
  | "too-complex"
  | "withheld-region";

export type CleanerFinding = Readonly<{
  type: CleanerFindingType;
  index: number;
  count: number;
  note?: string;
}>;

export type CleanTextResult = { clean: string; findings: CleanerFinding[]; withheld?: true };

/** The technique families this cleaner is designed to catch. */
export const COVERED: readonly CleanerFindingType[] = [
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
  "hidden-html",
];

// Thresholds chosen on codenclawed's benign corpus: a legitimate ZWJ emoji or
// Indic cluster uses isolated joiners, never a long pure run.
const ZW_RUN = 4;
const VS_RUN = 2;
const MAX_PER_TYPE = 32;
const MAX_ROUNDS = 8;

// Code point classes.
const NONE = 0;
const TAG = 1;
const VS = 2;
const INVIS = 3;
const BIDI_OVERRIDE = 4;
const BIDI_OPEN = 5;
const BIDI_POP = 6;
const LONE = 7;

const BMP = new Uint8Array(0x10000);
for (const [a, b] of DEFAULT_IGNORABLE_RANGES) {
  for (let cp = a; cp <= b && cp <= 0xffff; cp++) {
    BMP[cp] = INVIS;
  }
}
for (let cp = 0xfe00; cp <= 0xfe0f; cp++) {
  BMP[cp] = VS;
}
for (const cp of [0x180b, 0x180c, 0x180d, 0x180f]) {
  BMP[cp] = VS;
}
BMP[0x202d] = BIDI_OVERRIDE;
BMP[0x202e] = BIDI_OVERRIDE;
for (const cp of [0x202a, 0x202b, 0x2066, 0x2067, 0x2068]) {
  BMP[cp] = BIDI_OPEN;
}
BMP[0x202c] = BIDI_POP;
BMP[0x2069] = BIDI_POP;
// A surrogate unit reaches the table only when it is not half of a valid
// pair: stripping one could reassemble a tag character from halves split by
// an invisible separator, so a lone half is stripped and flagged like a tag.
for (let cp = 0xd800; cp <= 0xdfff; cp++) {
  BMP[cp] = LONE;
}
const ASTRAL_IGNORABLE = DEFAULT_IGNORABLE_RANGES.filter(([, b]) => b > 0xffff);

function classOf(cp: number): number {
  if (cp < 0x10000) {
    return BMP[cp];
  }
  if (cp >= 0xe0000 && cp <= 0xe007f) {
    return TAG;
  }
  if (cp >= 0xe0100 && cp <= 0xe01ef) {
    return VS;
  }
  for (const [a, b] of ASTRAL_IGNORABLE) {
    if (cp >= a && cp <= b) {
      return INVIS;
    }
  }
  return NONE;
}

class TooComplex extends Error {}

type Tick = () => void;
type Add = (type: CleanerFindingType, index: number, count: number, note?: string) => void;

// A cheap deadline check: reads the clock once every 64Ki steps.
function makeClock(deadline: number): Tick {
  let n = 0;
  return () => {
    if ((++n & 0xffff) === 0 && performance.now() > deadline) {
      throw new TooComplex();
    }
  };
}

// Little-endian hosts decode the code units in one copy (lone surrogates are kept as they are).
const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

function decode(units: Uint16Array, len: number): string {
  if (LITTLE_ENDIAN) {
    return Buffer.from(units.buffer, units.byteOffset, len * 2).toString("utf16le");
  }
  let s = "";
  for (let i = 0; i < len; i += 8192) {
    s += String.fromCharCode(...units.subarray(i, Math.min(len, i + 8192)));
  }
  return s;
}

function encode(s: string): Uint16Array {
  const u = new Uint16Array(s.length);
  for (let i = 0; i < s.length; i++) {
    u[i] = s.charCodeAt(i);
  }
  return u;
}

function isAscii(s: string): boolean {
  return Buffer.byteLength(s, "utf8") === s.length;
}

/** Number of code points in a string (no intermediate array). */
export function codePointLength(s: string): number {
  let n = s.length;
  for (let i = 0; i + 1 < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        n--;
        i++;
      }
    }
  }
  return n;
}

// ---------------------------------------------------------------- terminal rendering

const CURSOR_FINALS = new Set(Array.from("ABCDEFGHJKfsu").map((c) => c.charCodeAt(0)));

// Apply one SGR parameter list to the conceal state. 8 conceals; 0, 28 or an
// empty parameter reveals; the arguments of the extended colors 38/48/58 are
// skipped (38;5;8 is a gray foreground, not conceal). A private-prefixed list
// can only conceal, never reveal, so a crafted one cannot end a hidden span.
function applySgr(
  buf: Uint16Array,
  from: number,
  to: number,
  concealed: boolean,
): { concealed: boolean; sawConceal: boolean } {
  const priv = from < to && buf[from] >= 0x3c && buf[from] <= 0x3f;
  const vals: number[] = [];
  const colon: boolean[] = [];
  let v = 0;
  let hasColon = false;
  for (let p = from; p <= to; p++) {
    const c = p < to ? buf[p] : 0x3b;
    if (c >= 0x30 && c <= 0x39) {
      if (!hasColon && v < 100000) {
        v = v * 10 + (c - 0x30);
      }
    } else if (c === 0x3a) {
      hasColon = true;
    } else if (c === 0x3b) {
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
    } else if ((x === 0 || x === 28) && !priv) {
      concealed = false;
    }
  }
  return { concealed, sawConceal };
}

let scratch = new Uint32Array(256);
// Overwrite rendering of buf[from..to), a line holding a bare CR or a
// backspace, as a terminal's cursor does it. A CRLF ending is kept. Linear.
function overwriteLine(buf: Uint16Array, from: number, to: number): number {
  let end = to;
  const crlf = end > from && buf[end - 1] === 0x0d;
  if (crlf) {
    end--;
  }
  if (scratch.length < end - from) {
    scratch = new Uint32Array(Math.max(end - from, scratch.length * 2));
  }
  let col = 0;
  let width = 0;
  for (let q = from; q < end; q++) {
    const c = buf[q];
    if (c === 0x0d) {
      col = 0;
      continue;
    }
    if (c === 0x08) {
      if (col > 0) {
        col--;
      }
      continue;
    }
    let cp = c;
    if (c >= 0xd800 && c <= 0xdbff && q + 1 < end && buf[q + 1] >= 0xdc00 && buf[q + 1] <= 0xdfff) {
      cp = ((c - 0xd800) << 10) + (buf[q + 1] - 0xdc00) + 0x10000;
      q++;
    }
    scratch[col++] = cp;
    if (col > width) {
      width = col;
    }
  }
  let w = from;
  for (let k = 0; k < width; k++) {
    const cp = scratch[k];
    if (cp > 0xffff) {
      buf[w++] = 0xd800 + ((cp - 0x10000) >> 10);
      buf[w++] = 0xdc00 + ((cp - 0x10000) & 0x3ff);
    } else {
      buf[w++] = cp;
    }
  }
  if (crlf) {
    buf[w++] = 0x0d;
  }
  return w;
}

const isC1String = (c: number) =>
  c === 0x90 || c === 0x98 || c === 0x9d || c === 0x9e || c === 0x9f;
const isStringIntro = (x: number) =>
  x === 0x5d || x === 0x50 || x === 0x58 || x === 0x5e || x === 0x5f;

type Rendered = {
  out: Uint16Array;
  len: number;
  conceal: number;
  cursor: number;
  ctrl: number;
  c1: number;
  unterminated: boolean;
};

// Render src[0..len) the way a terminal shows it: concealed spans are not
// drawn, CSI/OSC/DCS/SOS/PM/APC escapes (7-bit and 8-bit forms) are dropped, a
// lone CR overwrites the line from column 0, a backspace moves one column
// left, a vertical tab or form feed starts a new line. One pass.
function renderUnits(src: Uint16Array, len: number, tick: Tick): Rendered {
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
    // A literal ESC already in the output joins the next character into an
    // escape introducer, so nested escapes resolve in this one pass.
    const popEsc = c !== 0x1b && !concealed && r > lineStart && out[r - 1] === 0x1b;
    const csi =
      c === 0x1b && k + 1 < len && src[k + 1] === 0x5b
        ? k + 2
        : c === 0x9b
          ? k + 1
          : popEsc && c === 0x5b
            ? k + 1
            : -1;
    if (csi >= 0) {
      let p = csi;
      while (p < len && src[p] >= 0x30 && src[p] <= 0x3f) {
        p++;
      }
      const paramsEnd = p;
      while (p < len && src[p] >= 0x20 && src[p] <= 0x2f) {
        p++;
      }
      if (p < len && src[p] >= 0x40 && src[p] <= 0x7e) {
        const fin = src[p];
        if (c === 0x9b && c1 < 0) {
          c1 = r;
        }
        if (fin === 0x6d && paramsEnd === p) {
          const s = applySgr(src, csi, paramsEnd, concealed);
          concealed = s.concealed;
          if (s.sawConceal && conceal < 0) {
            conceal = r;
          }
        } else if (CURSOR_FINALS.has(fin) && cursor < 0) {
          cursor = r;
        }
        if (popEsc && c === 0x5b) {
          r--;
        }
        k = p + 1;
        continue;
      }
    } else {
      let body = -1;
      let osc = false;
      if (c === 0x1b && k + 1 < len) {
        const nx = src[k + 1];
        if (isStringIntro(nx)) {
          body = k + 2;
          osc = nx === 0x5d;
        }
      } else if (popEsc && isStringIntro(c)) {
        body = k + 1;
        osc = c === 0x5d;
        r--;
      } else if (isC1String(c)) {
        body = k + 1;
        osc = c === 0x9d;
        if (c1 < 0) {
          c1 = r;
        }
      }
      if (body >= 0) {
        let p = body;
        let end = -1;
        while (p < len) {
          const d = src[p];
          if (osc && d === 0x07) {
            end = p + 1;
            break;
          }
          if (d === 0x9c) {
            end = p + 1;
            break;
          }
          if (d === 0x1b && p + 1 < len && src[p + 1] === 0x5c) {
            end = p + 2;
            break;
          }
          p++;
          tick();
        }
        if (end < 0) {
          // Unterminated: a terminal swallows the rest of the output.
          unterminated = true;
          if (conceal < 0) {
            conceal = r;
          }
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
    if (c === 0x0a || c === 0x0b || c === 0x0c) {
      if (c !== 0x0a && ctrl < 0) {
        ctrl = r;
      }
      if (lineOverwrite) {
        flushLine();
      }
      lineOverwrite = false;
      out[r++] = 0x0a;
      lineStart = r;
      k++;
      continue;
    }
    if (c === 0x08) {
      if (ctrl < 0) {
        ctrl = r;
      }
      lineOverwrite = true;
    } else if (c === 0x0d && !(k + 1 < len && src[k + 1] === 0x0a)) {
      lineOverwrite = true;
    }
    if (r >= out.length) {
      const grown = new Uint16Array(out.length * 2 + 16);
      grown.set(out);
      out = grown;
    }
    out[r++] = c;
    k++;
  }
  if (lineOverwrite) {
    flushLine();
  }
  return { out, len: r, conceal, cursor, ctrl, c1, unterminated };
}

/** Does s hold anything renderUnits changes (ESC, CR, BS, VT, FF, or an 8-bit C1 introducer)? */
export function needsRender(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (
      c === 0x08 ||
      c === 0x0b ||
      c === 0x0c ||
      c === 0x0d ||
      c === 0x1b ||
      c === 0x90 ||
      c === 0x98 ||
      c === 0x9b ||
      (c >= 0x9d && c <= 0x9f)
    ) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- hidden HTML

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
  "chmod",
]);
const DOTTED = [".env", ".git", ".claude", ".mcp"];
const MAX_WORD = Math.max(...[...INSTRUCTION_WORDS].map((w) => w.length));
const WORDS_BY_LENGTH: string[][] = [];
for (const w of INSTRUCTION_WORDS) {
  (WORDS_BY_LENGTH[w.length] ??= []).push(w);
}
const WORD_UNIT = new Uint8Array(128);
for (const ch of "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_") {
  WORD_UNIT[ch.charCodeAt(0)] = 1;
}
const isWordUnit = (c: number) => c < 128 && WORD_UNIT[c] === 1;
const lowerAscii = (c: number) => (c >= 0x41 && c <= 0x5a ? c + 32 : c);
// The JavaScript \s set.
const isJsSpace = (c: number) =>
  (c >= 0x09 && c <= 0x0d) ||
  c === 0x20 ||
  c === 0xa0 ||
  c === 0x1680 ||
  (c >= 0x2000 && c <= 0x200a) ||
  c === 0x2028 ||
  c === 0x2029 ||
  c === 0x202f ||
  c === 0x205f ||
  c === 0x3000 ||
  c === 0xfeff;

function matchCI(text: string, pos: number, needle: string): boolean {
  if (pos + needle.length > text.length) {
    return false;
  }
  for (let q = 0; q < needle.length; q++) {
    if (lowerAscii(text.charCodeAt(pos + q)) !== needle.charCodeAt(q)) {
      return false;
    }
  }
  return true;
}

// Does text[from..to) read like an instruction to the agent? Whole ASCII words
// against the list, the dotted names at each '.', and "mcp__" inside a word.
function readsLikeInstruction(text: string, from: number, to: number, tick: Tick): boolean {
  let p = from;
  while (p < to) {
    tick();
    let c = text.charCodeAt(p);
    while (p < to && !isWordUnit(c)) {
      if (c === 0x2e) {
        for (const sub of DOTTED) {
          if (p + sub.length <= to && matchCI(text, p, sub)) {
            return true;
          }
        }
      }
      c = ++p < to ? text.charCodeAt(p) : 0;
    }
    const ws = p;
    while (p < to && isWordUnit(text.charCodeAt(p))) {
      p++;
    }
    const len = p - ws;
    const words = len <= MAX_WORD ? WORDS_BY_LENGTH[len] : undefined;
    if (words) {
      for (const word of words) {
        if (matchCI(text, ws, word)) {
          return true;
        }
      }
    }
    for (let q = ws; q + 5 <= (len >= 5 ? p : 0); q++) {
      if (
        text.charCodeAt(q + 3) === 0x5f &&
        text.charCodeAt(q + 4) === 0x5f &&
        matchCI(text, q, "mcp__")
      ) {
        return true;
      }
    }
  }
  return false;
}

const STYLE_HIDING = [
  "display:none",
  "font-size:0",
  "visibility:hidden",
  "color:fff",
  "color:#fff",
  "color:white",
];

function cssHides(text: string, from: number, to: number, tick: Tick): boolean {
  let css = "";
  let pending = "";
  for (let p = from; p < to; p++) {
    tick();
    const c = text.charCodeAt(p);
    if (c === 0x3a) {
      css += ":";
      pending = "";
      while (p + 1 < to && isJsSpace(text.charCodeAt(p + 1))) {
        p++;
      }
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

function closeDetails(text: string, from: number, tick: Tick): number {
  for (let p = text.indexOf("</", from); p >= 0; p = text.indexOf("</", p + 2)) {
    tick();
    if (matchCI(text, p, "</details>")) {
      return p;
    }
  }
  return -1;
}

function hiddenHtml(text: string, add: Add, tick: Tick): void {
  let p = 0;
  for (;;) {
    const s = text.indexOf("<!--", p);
    if (s < 0) {
      break;
    }
    const e = text.indexOf("-->", s + 4);
    if (e < 0) {
      break;
    }
    if (readsLikeInstruction(text, s + 4, e, tick)) {
      add("hidden-html", s, e - s - 4, "comment");
      break;
    }
    p = e + 3;
  }
  // style="...hiding property...", anchored on each '=' (linear: the next
  // quote and colon positions are cached and reused until passed).
  const cache = new Map<string, number>();
  const nextAt = (ch: string, from: number): number => {
    let at = cache.get(ch);
    if (at === undefined || (at >= 0 && at < from)) {
      at = text.indexOf(ch, from);
      cache.set(ch, at);
    }
    return at < 0 ? text.length : at;
  };
  for (let e = text.indexOf("="); e >= 0; e = text.indexOf("=", e + 1)) {
    tick();
    let k = e - 1;
    while (k >= 0 && isJsSpace(text.charCodeAt(k))) {
      k--;
    }
    if (k < 4 || !matchCI(text, k - 4, "style")) {
      continue;
    }
    let q = e + 1;
    while (q < text.length && isJsSpace(text.charCodeAt(q))) {
      q++;
    }
    const quote = text.charCodeAt(q);
    if (quote !== 0x22 && quote !== 0x27) {
      continue;
    }
    const v = Math.min(nextAt('"', q + 1), nextAt("'", q + 1));
    const colon = nextAt(":", q + 1) < v;
    if (colon && cssHides(text, q + 1, v, tick)) {
      add("hidden-html", k - 4, 1, "zero-size/transparent text");
      break;
    }
  }
  p = 0;
  for (;;) {
    const s = text.indexOf("<", p);
    if (s < 0) {
      break;
    }
    tick();
    const after = text.charCodeAt(s + 8);
    if (!matchCI(text, s, "<details") || !(after === 0x3e || isJsSpace(after))) {
      p = s + 1;
      continue;
    }
    const close = closeDetails(text, s + 9, tick);
    const end = close < 0 ? text.length : close + 10;
    if (readsLikeInstruction(text, s, end, tick)) {
      add("hidden-html", s, 1, "details");
      break;
    }
    if (close < 0) {
      break;
    }
    p = end;
  }
}

// ---------------------------------------------------------------- notice imitation

const NOTICE_WORD = "enclawed";

// Look-alikes folded onto the Latin letter a reader sees: Cyrillic and Greek
// homoglyphs, uppercase forms that differ from their lowercase look, a few
// Latin variants, and colons/brackets a reader takes for ":" and "]".
// Fullwidth and other compatibility forms are folded by NFKD first.
const CONFUSABLE = new Map<string, string>(
  Object.entries({
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
    "⌋": "]",
  }),
);
const CONFUSABLE_UPPER = new Map<string, string>(
  Object.entries({
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
    К: "k",
  }),
);
const COMBINING = /\p{M}/gu;
const UNICODE_SPACE = /^[\p{Zs}\t]$/u;
const skelCache = new Map<string, string>();

// The skeleton of one non-ASCII code point: what a reader sees, folded to
// lowercase Latin ("" when it shows nothing).
function skeletonOf(ch: string): string {
  const cached = skelCache.get(ch);
  if (cached !== undefined) {
    return cached;
  }
  let v: string;
  const upper = CONFUSABLE_UPPER.get(ch);
  if (UNICODE_SPACE.test(ch)) {
    v = " ";
  } else if (upper !== undefined) {
    v = upper;
  } else {
    let out = "";
    for (const c of ch.normalize("NFKD").replace(COMBINING, "")) {
      const cp = c.codePointAt(0) ?? 0;
      if (classOf(cp) !== NONE) {
        continue;
      }
      if (cp < 0x80) {
        out += c.toLowerCase();
        continue;
      }
      const up = CONFUSABLE_UPPER.get(c);
      if (up !== undefined) {
        out += up;
        continue;
      }
      const l = c.toLowerCase();
      out += CONFUSABLE.get(l) ?? CONFUSABLE.get(c) ?? l;
    }
    v = out;
  }
  if (skelCache.size < 8192) {
    skelCache.set(ch, v);
  }
  return v;
}

const isEmphasis = (c: number) => c === 0x2a || c === 0x5f || c === 0x60 || c === 0x7e;

// BMP skeleton cache: -1 unknown, -2 empty, -3 longer than one unit.
const SKEL_BMP = new Int32Array(0x10000).fill(-1);
for (let c = 0; c < 0x80; c++) {
  SKEL_BMP[c] = isEmphasis(c) ? -2 : c === 0x09 ? 0x20 : c >= 0x41 && c <= 0x5a ? c + 32 : c;
}

/**
 * The skeleton of `s`: what a reader sees, as lowercase Latin with look-alikes
 * folded, combining marks, invisibles and Markdown emphasis dropped, runs of
 * spaces collapsed. `map[i]` is the index in `s` skeleton character i came
 * from. Linear.
 */
export function skeleton(s: string, tick: Tick = () => {}): { skel: string; map: Int32Array } {
  let buf = new Uint16Array(s.length + 64);
  let map = new Int32Array(s.length + 64);
  let n = 0;
  let space = false;
  const push = (u: number, at: number) => {
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
    let v: number;
    let w = 1;
    let multi = "";
    if (c < 0xd800 || c > 0xdfff) {
      v = SKEL_BMP[c];
      if (v === -1) {
        const str = skeletonOf(String.fromCharCode(c));
        v = str.length === 0 ? -2 : str.length === 1 ? str.charCodeAt(0) : -3;
        SKEL_BMP[c] = v;
      }
      if (v === -3) {
        multi = skeletonOf(String.fromCharCode(c));
      }
    } else {
      const cp = s.codePointAt(i) ?? c;
      w = cp > 0xffff ? 2 : 1;
      multi = skeletonOf(String.fromCodePoint(cp));
      v = -3;
    }
    if (v === -2) {
      i += w;
      continue;
    }
    if (v >= 0) {
      if (v === 0x20) {
        if (!space) {
          push(0x20, i);
        }
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
      if (u === 0x20) {
        if (space) {
          continue;
        }
        space = true;
      } else {
        space = false;
      }
      push(u, i);
    }
    i += w;
  }
  return { skel: decode(buf, n), map: map.subarray(0, n) };
}

const ASCII_WORD = /e[*_`~]*n[*_`~]*c[*_`~]*l[*_`~]*a[*_`~]*w[*_`~]*e[*_`~]*d/i;

function quotedBefore(s: string, o: number): boolean {
  let b = o - 1;
  while (b >= 0 && (s.charCodeAt(b) === 0x2a || s.charCodeAt(b) === 0x5f)) {
    b--;
  }
  if (b >= 0 && s.charCodeAt(b) === 0x5b) {
    b--;
  }
  const c = b >= 0 ? s.charCodeAt(b) : 0;
  return c === 0x60 || c === 0x22 || c === 0x27;
}

// Is s[o] inside a Markdown inline code span on its line? Asked in increasing
// order, so the backtick count is carried forward: linear overall.
function codeSpanTracker(s: string): (o: number) => boolean {
  let ls = 0;
  let pos = 0;
  let before = 0;
  let firstLineTotal = -1;
  return (o) => {
    for (; pos < o; pos++) {
      const c = s.charCodeAt(pos);
      if (c === 0x0a) {
        ls = pos + 1;
        before = 0;
      } else if (c === 0x60) {
        before++;
      }
    }
    if (before % 2 === 1) {
      return true;
    }
    if (ls !== 0) {
      return false;
    }
    if (firstLineTotal < 0) {
      let le = s.indexOf("\n");
      if (le < 0) {
        le = s.length;
      }
      firstLineTotal = 0;
      for (let k = 0; k < le; k++) {
        if (s.charCodeAt(k) === 0x60) {
          firstLineTotal++;
        }
      }
    }
    return (firstLineTotal - before) % 2 === 1;
  };
}

const isHexSkel = (c: number) => (c >= 0x30 && c <= 0x39) || (c >= 0x61 && c <= 0x66);

/**
 * Text that imitates a notice from Enclawed, matched on the skeleton anywhere
 * in a line: "enclawed", optional space, an optional hex token of 4 or more
 * characters, optional space, then ":" (or "]" after a token). Each match gets
 * NOTICE_QUOTE before the word in the original text. A plain quoted or
 * inline-code "Enclawed:" (documentation of the format) is left alone. Linear.
 */
export function neutralizeNotices(
  s: string,
  tick: Tick = () => {},
): { text: string; at: number; count: number } {
  if (s.length < NOTICE_WORD.length) {
    return { text: s, at: -1, count: 0 };
  }
  const asciiOnly = isAscii(s);
  if (asciiOnly && !ASCII_WORD.test(s)) {
    return { text: s, at: -1, count: 0 };
  }
  const plain = asciiOnly && !/[*_`~\t]| {2}/.test(s);
  const { skel, map } = plain ? { skel: s.toLowerCase(), map: null } : skeleton(s, tick);
  const inCode = codeSpanTracker(s);
  let out = "";
  let last = 0;
  let at = -1;
  let count = 0;
  for (
    let i = skel.indexOf(NOTICE_WORD);
    i >= 0;
    i = skel.indexOf(NOTICE_WORD, i + NOTICE_WORD.length)
  ) {
    tick();
    let f = i + NOTICE_WORD.length;
    if (skel.charCodeAt(f) === 0x20) {
      f++;
    }
    const hexFrom = f;
    while (f < skel.length && f - hexFrom <= 64 && isHexSkel(skel.charCodeAt(f))) {
      f++;
    }
    const tagged = f - hexFrom >= 4;
    if (f > hexFrom && !tagged) {
      continue;
    }
    if (skel.charCodeAt(f) === 0x20) {
      f++;
    }
    const c = skel.charCodeAt(f);
    if (!(c === 0x3a || (c === 0x5d && tagged))) {
      continue;
    }
    const o = map ? map[i] : i;
    if (
      o < last ||
      (o >= NOTICE_QUOTE.length && s.slice(o - NOTICE_QUOTE.length, o) === NOTICE_QUOTE)
    ) {
      continue;
    }
    const before = i > 0 ? skel.charCodeAt(i - 1) : 0x20;
    if (
      (before >= 0x61 && before <= 0x7a) ||
      (before >= 0x30 && before <= 0x39) ||
      before === 0x2e ||
      before === 0x2f ||
      before === 0x5c
    ) {
      continue;
    }
    if (!tagged && (quotedBefore(s, o) || inCode(o))) {
      continue;
    }
    if (at < 0) {
      at = o;
    }
    count++;
    out += `${s.slice(last, o)}${NOTICE_QUOTE}`;
    last = o;
  }
  return count === 0 ? { text: s, at: -1, count: 0 } : { text: out + s.slice(last), at, count };
}

// ---------------------------------------------------------------- legitimate joiners

const JOINING_SCRIPT =
  /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Nko}\p{Script=Mongolian}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Oriya}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Sinhala}\p{Script=Myanmar}\p{Script=Khmer}\p{Script=Tibetan}\p{Script=Thai}\p{Script=Lao}\p{Script=Balinese}\p{Script=Javanese}]/u;
const WORD_BREAK_SCRIPT =
  /[\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\p{Script=Tibetan}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Javanese}\p{Script=Balinese}]/u;
const PICTO = /\p{Extended_Pictographic}/u;
const LETTER = /[\p{L}\p{M}\p{N}]/u;
const isEmojiModifier = (cp: number) => cp >= 0x1f3fb && cp <= 0x1f3ff;

function cpBefore(text: string, at: number): number {
  if (at <= 0) {
    return -1;
  }
  const lo = text.charCodeAt(at - 1);
  if (lo >= 0xdc00 && lo <= 0xdfff && at >= 2) {
    const hi = text.charCodeAt(at - 2);
    if (hi >= 0xd800 && hi <= 0xdbff) {
      return ((hi - 0xd800) << 10) + (lo - 0xdc00) + 0x10000;
    }
  }
  return lo;
}

// A single joiner, zero-width space, soft hyphen or variation selector in a
// context where it has a meaning is kept, byte for byte.
function legitInContext(
  text: string,
  i: number,
  j: number,
  c: number,
  cpAt: (at: number) => number,
): boolean {
  const prev = cpBefore(text, i);
  if (prev < 0) {
    return false;
  }
  const prevCls = classOf(prev);
  const p = String.fromCodePoint(prev);
  if (c === 0xfe0e || c === 0xfe0f) {
    return prevCls === NONE && (PICTO.test(p) || /^[0-9#*]$/.test(p));
  }
  if (c >= 0xfe00 && c <= 0xfe0d) {
    return prevCls === NONE && prev > 0x7f && /^[\p{L}\p{S}\p{N}]$/u.test(p);
  }
  const cp = c >= 0xd800 && c <= 0xdbff ? (text.codePointAt(i) ?? c) : c;
  if (cp >= 0xe0100 && cp <= 0xe01ef) {
    return prevCls === NONE && /\p{Script=Han}/u.test(p);
  }
  if (cp === 0x180b || cp === 0x180c || cp === 0x180d || cp === 0x180f) {
    return /\p{Script=Mongolian}/u.test(p);
  }
  const next = j < text.length ? cpAt(j) : -1;
  if (next < 0) {
    return false;
  }
  const nx = String.fromCodePoint(next);
  const nextCls = classOf(next);
  if (
    cp === 0x200d &&
    (PICTO.test(p) || isEmojiModifier(prev) || prev === 0xfe0f) &&
    PICTO.test(nx)
  ) {
    return true;
  }
  if (cp === 0x200c || cp === 0x200d) {
    return (
      prevCls === NONE && nextCls === NONE && JOINING_SCRIPT.test(p) && JOINING_SCRIPT.test(nx)
    );
  }
  if (cp === 0x200b) {
    return (
      prevCls === NONE &&
      nextCls === NONE &&
      WORD_BREAK_SCRIPT.test(p) &&
      WORD_BREAK_SCRIPT.test(nx)
    );
  }
  if (cp === 0xad || cp === 0x2060) {
    return prevCls === NONE && nextCls === NONE && LETTER.test(p) && LETTER.test(nx);
  }
  return false;
}

// Pass 1: invisible code points, one pass by code point, collapsing runs.
function stripInvisible(
  text: string,
  add: Add,
  tick: Tick,
): { keep: Uint16Array; o: number; removedAny: boolean } {
  const n = text.length;
  const keep = new Uint16Array(n);
  let o = 0;
  let removedAny = false;
  let cpIndex = 0;
  let opens = 0;
  let unbalanced = false;
  let i = 0;
  let width = 1;
  const cpAt = (at: number): number => {
    const c = text.charCodeAt(at);
    if (c >= 0xd800 && c <= 0xdbff && at + 1 < n) {
      const d = text.charCodeAt(at + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        width = 2;
        return ((c - 0xd800) << 10) + (d - 0xdc00) + 0x10000;
      }
    }
    width = 1;
    return c;
  };
  while (i < n) {
    tick();
    let c = text.charCodeAt(i);
    if (c < 0xad) {
      const from = i;
      do {
        keep[o++] = c;
        c = ++i < n ? text.charCodeAt(i) : 0xffff;
      } while (c < 0xad);
      cpIndex += i - from;
      continue;
    }
    let cls: number;
    if (c < 0xd800 || c > 0xdfff) {
      cls = BMP[c];
      width = 1;
    } else {
      cls = classOf(cpAt(i));
    }
    if (cls === NONE) {
      keep[o++] = c;
      if (width === 2) {
        keep[o++] = text.charCodeAt(i + 1);
      }
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
        if (classOf(cpAt(j)) !== cls) {
          break;
        }
        j += width;
        count++;
      }
      if (count === 1 && (cls === INVIS || cls === VS) && legitInContext(text, i, j, c, cpAt)) {
        for (let q = i; q < j; q++) {
          keep[o++] = text.charCodeAt(q);
        }
        cpIndex++;
        i = j;
        continue;
      }
      if (cls === TAG) {
        add("unicode-tag", start, count);
      } else if (cls === LONE) {
        add("lone-surrogate", start, count);
      } else if (cls === VS && count >= VS_RUN) {
        add("variation-selector-run", start, count);
      } else if (cls === INVIS && count >= ZW_RUN) {
        add("zero-width-run", start, count);
      }
      removedAny = true;
      cpIndex += count;
      i = j;
      continue;
    }
    if (cls === BIDI_OVERRIDE) {
      add("bidi-control", cpIndex, 1, "override (LRO/RLO)");
      removedAny = true;
    } else {
      // Embeddings/isolates are flagged only when unbalanced (the Trojan
      // Source signature), so legitimate right-to-left text is not.
      if (cls === BIDI_OPEN) {
        opens++;
      } else if (--opens < 0) {
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
      if (cls !== BIDI_OPEN && cls !== BIDI_POP) {
        keep[w++] = keep[q];
      }
    }
    o = w;
    removedAny = true;
  }
  return { keep, o, removedAny };
}

// One cleaning round: invisible code points, terminal rendering, notice
// neutralization. Returns `text` itself when nothing changed.
function cleanRound(text: string, add: Add, tick: Tick): string {
  const n = text.length;
  const ascii = isAscii(text);
  let keep: Uint16Array | null = null;
  let o = 0;
  let removedAny = false;
  if (!ascii) {
    ({ keep, o, removedAny } = stripInvisible(text, add, tick));
  }
  let clean: string;
  if (!removedAny && !needsRender(text)) {
    clean = text;
  } else {
    if (keep === null) {
      keep = encode(text);
      o = n;
    }
    const r = renderUnits(keep, o, tick);
    if (r.conceal >= 0) {
      add("ansi-conceal", r.conceal, 1, r.unterminated ? "unterminated escape string" : undefined);
    }
    if (r.cursor >= 0) {
      add("ansi-cursor", r.cursor, 1);
    }
    if (r.ctrl >= 0) {
      add("control-overwrite", r.ctrl, 1, "backspace, vertical tab or form feed");
    }
    if (r.c1 >= 0) {
      add("ansi-c1", r.c1, 1, "8-bit C1 escape");
    }
    clean = decode(r.out, r.len);
    if (clean === text) {
      clean = text;
    }
  }
  const nn = neutralizeNotices(clean, tick);
  if (nn.count > 0) {
    add("spoofed-notice", nn.at, nn.count);
    clean = nn.text;
  }
  return clean;
}

// Replace the lines that one more round would still change with
// WITHHELD_MARKER, and check that the result is a fixed point.
function withholdRegion(clean: string, next: string, add: Add, tick: Tick): string {
  let p = 0;
  const max = Math.min(clean.length, next.length);
  while (p < max && clean.charCodeAt(p) === next.charCodeAt(p)) {
    p++;
  }
  let q = 0;
  while (
    q < max - p &&
    clean.charCodeAt(clean.length - 1 - q) === next.charCodeAt(next.length - 1 - q)
  ) {
    q++;
  }
  const from = p === 0 ? 0 : clean.lastIndexOf("\n", p - 1) + 1;
  const nl = clean.indexOf("\n", Math.max(from, clean.length - q - 1));
  const to = nl < 0 ? clean.length : nl;
  const out = `${clean.slice(0, from)}${WITHHELD_MARKER}${clean.slice(to)}`;
  if (cleanRound(out, () => {}, tick) !== out) {
    throw new TooComplex("no fixed point");
  }
  add("withheld-region", from, to - from, "no fixed point");
  return out;
}

// The clean is a fixed point of one cleaning round: a round can bring
// characters together (stripping an invisible separator between two halves of
// a surrogate pair), so rounds repeat until one changes nothing.
function scan(text: string, tick: Tick, deadline: number, maxRounds: number): CleanTextResult {
  if (performance.now() > deadline) {
    throw new TooComplex();
  }
  const findings: CleanerFinding[] = [];
  const perType = new Map<string, number>();
  const add: Add = (type, index, count, note) => {
    const k = perType.get(type) ?? 0;
    if (k < MAX_PER_TYPE) {
      perType.set(type, k + 1);
      findings.push({ type, index, count, ...(note ? { note } : {}) });
    }
  };
  let clean = text;
  for (let round = 0; ; round++) {
    const next = cleanRound(clean, add, tick);
    if (next === clean) {
      break;
    }
    if (round + 1 >= maxRounds) {
      clean = withholdRegion(clean, next, add, tick);
      break;
    }
    clean = next;
  }
  hiddenHtml(text, add, tick);
  if (performance.now() > deadline) {
    throw new TooComplex();
  }
  return { clean, findings };
}

/** The fail-safe result for a payload that is not inspected. */
export function withheldResult(text: unknown, note = "time budget exceeded"): CleanTextResult {
  return {
    clean: WITHHELD_MARKER,
    findings: [
      { type: "too-complex", index: 0, count: typeof text === "string" ? text.length : 0, note },
    ],
    withheld: true,
  };
}

/**
 * Clean one string. On budget exhaustion `clean` is WITHHELD_MARKER and the
 * single finding is "too-complex": the content is never passed through.
 */
export function cleanText(
  text: string,
  opts: { budgetMs?: number; deadline?: number; maxRounds?: number } = {},
): CleanTextResult {
  if (typeof text !== "string") {
    return { clean: "", findings: [] };
  }
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const deadline = Math.min(performance.now() + budgetMs, opts.deadline ?? Infinity);
  try {
    return scan(text, makeClock(deadline), deadline, opts.maxRounds ?? MAX_ROUNDS);
  } catch (err) {
    if (err instanceof TooComplex) {
      return withheldResult(text, err.message || undefined);
    }
    throw err;
  }
}

/** Strip invisible and bidi code points; returns the visible text and how many were removed. */
export function stripHidden(s: string): { text: string; removed: number } {
  let out = "";
  let removed = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    const cls = classOf(cp);
    if (cls !== NONE || cp === 0x200e || cp === 0x200f || cp === 0x61c) {
      removed++;
    } else {
      out += ch;
    }
  }
  return { text: out, removed };
}
