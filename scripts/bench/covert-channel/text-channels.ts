// Text-domain covert channels: each is a working encoder plus the
// receiver-side decoder an attacker would actually build.
//
// All non-ASCII / invisible inputs are built from numeric code points so this
// source file contains no invisible characters of its own.

import { SYNONYM_RINGS } from "../../../extensions/egress-semantic-scrambler/api.js";
import { bitsToInt, intToBits, padBits, type Bit } from "./stats.js";

const cp = (...c: number[]): string => String.fromCodePoint(...c);

// --------------------------------------------------------------------------
// covert-channel definitions — each is a real encoder + receiver-side decoder
// --------------------------------------------------------------------------

export type CovertChannel = {
  name: string;
  family: "canonicalizer" | "noise" | "scrambler" | "entropy" | "taint";
  bits: number;
  encode(secret: Bit[]): string;
  decode(text: string): Bit[];
};

export const PROSE =
  "the quarterly operations review is scheduled for next week so every team " +
  "lead should compile their status notes and circulate the agenda before the " +
  "planning session opens on monday morning with the regional managers";

// --- zero-width interleave: ZWSP = 1, ZWNJ = 0, one marker per slot ---------
const ZWSP = 0x200b;
const ZWNJ = 0x200c;
function isInvisibleMarker(code: number): boolean {
  return code === ZWSP || code === ZWNJ;
}
const zeroWidthChannel: CovertChannel = {
  name: "zero-width-interleave",
  family: "canonicalizer",
  bits: 24,
  encode(secret) {
    let out = "";
    let slot = 0;
    for (const ch of PROSE) {
      out += ch;
      if (slot < secret.length) {
        out += cp(secret[slot] === 1 ? ZWSP : ZWNJ);
        slot++;
      }
    }
    return out;
  },
  decode(text) {
    // Receiver walks the (visible, intact) carrier and reads the marker that
    // follows each visible char. A stripped marker reads as "absent".
    const bits: Bit[] = [];
    const chars = Array.from(text);
    for (let i = 0; i < chars.length; i++) {
      const code = chars[i].codePointAt(0)!;
      if (isInvisibleMarker(code)) {
        continue;
      }
      const nextCode = chars[i + 1]?.codePointAt(0);
      if (nextCode === ZWSP) {
        bits.push(1);
      } else if (nextCode === ZWNJ) {
        bits.push(0);
      } else {
        bits.push(0);
      } // marker destroyed — receiver cannot tell
    }
    return padBits(bits, this.bits);
  },
};

// --- Unicode Tag smuggling: append a run of tag chars -----------------------
const unicodeTagChannel: CovertChannel = {
  name: "unicode-tag-append",
  family: "canonicalizer",
  bits: 24,
  encode(secret) {
    return PROSE + secret.map((b) => cp(0xe0030 + b)).join("");
  },
  decode(text) {
    const bits: Bit[] = [];
    for (const ch of text) {
      const code = ch.codePointAt(0)!;
      if (code >= 0xe0000 && code <= 0xe007f) {
        bits.push(code - 0xe0030 === 1 ? 1 : 0);
      }
    }
    return padBits(bits, this.bits);
  },
};

// --- variation-selector smuggling -------------------------------------------
const variationSelectorChannel: CovertChannel = {
  name: "variation-selector-append",
  family: "canonicalizer",
  bits: 24,
  encode(secret) {
    return PROSE + secret.map((b) => cp(0xe0100 + b)).join("");
  },
  decode(text) {
    const bits: Bit[] = [];
    for (const ch of text) {
      const code = ch.codePointAt(0)!;
      if (code >= 0xe0100 && code <= 0xe01ef) {
        bits.push(code - 0xe0100 === 1 ? 1 : 0);
      }
    }
    return padBits(bits, this.bits);
  },
};

// --- bidirectional-control smuggling ----------------------------------------
const bidiChannel: CovertChannel = {
  name: "bidi-control-append",
  family: "canonicalizer",
  bits: 24,
  encode(secret) {
    return PROSE + secret.map((b) => cp(b === 1 ? 0x202e : 0x2066)).join("");
  },
  decode(text) {
    const bits: Bit[] = [];
    for (const ch of text) {
      const code = ch.codePointAt(0)!;
      if (code === 0x202e) {
        bits.push(1);
      } else if (code === 0x2066) {
        bits.push(0);
      }
    }
    return padBits(bits, this.bits);
  },
};

// --- homoglyph substitution: Cyrillic look-alike = 1, ASCII = 0 -------------
const HOMO: Record<string, string> = { a: cp(0x0430), e: cp(0x0435), o: cp(0x043e), c: cp(0x0441) };
const HOMO_INVERSE: Record<string, Bit> = {};
for (const [, cyr] of Object.entries(HOMO)) {
  HOMO_INVERSE[cyr] = 1;
}
const homoglyphChannel: CovertChannel = {
  name: "homoglyph-substitution",
  family: "canonicalizer",
  bits: 24,
  encode(secret) {
    let slot = 0;
    let out = "";
    for (const ch of PROSE) {
      if (slot < secret.length && HOMO[ch]) {
        out += secret[slot] === 1 ? HOMO[ch] : ch;
        slot++;
      } else {
        out += ch;
      }
    }
    return out;
  },
  decode(text) {
    const bits: Bit[] = [];
    let slot = 0;
    for (const ch of text) {
      const isHomoSlot = Object.values(HOMO).includes(ch);
      const isLatinSlot = HOMO[ch] !== undefined;
      if (isHomoSlot || isLatinSlot) {
        if (slot < this.bits) {
          bits.push(isHomoSlot ? 1 : 0);
        }
        slot++;
      }
    }
    return padBits(bits, this.bits);
  },
};

// --- whitespace-count: double space = 1, single space = 0 -------------------
const whitespaceChannel: CovertChannel = {
  name: "whitespace-count",
  family: "noise",
  bits: 16,
  encode(secret) {
    const words = PROSE.split(" ");
    let out = words[0] ?? "";
    for (let i = 1; i < words.length; i++) {
      const bit = i - 1 < secret.length ? secret[i - 1] : 0;
      out += (bit === 1 ? "  " : " ") + words[i];
    }
    return out;
  },
  decode(text) {
    const runs = text.match(/ +/g) ?? [];
    return padBits(
      runs.map((r) => (r.length >= 2 ? 1 : 0) as Bit),
      this.bits,
    );
  },
};

// --- punctuation-count: "!!" = 1, "!" = 0 -----------------------------------
const punctuationChannel: CovertChannel = {
  name: "punctuation-count",
  family: "noise",
  bits: 12,
  encode(secret) {
    return secret.map((b, i) => `item ${i} done${b === 1 ? "!!" : "!"}`).join(" ");
  },
  decode(text) {
    const runs = text.match(/!+/g) ?? [];
    return padBits(
      runs.map((r) => (r.length >= 2 ? 1 : 0) as Bit),
      this.bits,
    );
  },
};

// --- JSON key-ordering permutation channel ----------------------------------
function factorial(n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i++) {
    f *= i;
  }
  return f;
}
function permutationFromIndex(n: number, index: number): number[] {
  const available = Array.from({ length: n }, (_, i) => i);
  const perm: number[] = [];
  let rem = index % factorial(n);
  for (let i = n; i >= 1; i--) {
    const f = factorial(i - 1);
    const j = Math.floor(rem / f);
    rem %= f;
    perm.push(available.splice(j, 1)[0]);
  }
  return perm;
}
function indexFromPermutation(perm: number[]): number {
  const n = perm.length;
  const available = Array.from({ length: n }, (_, i) => i);
  let index = 0;
  for (let i = 0; i < n; i++) {
    const j = available.indexOf(perm[i]);
    index += j * factorial(n - 1 - i);
    available.splice(j, 1);
  }
  return index;
}
const JSON_KEYS = Array.from({ length: 12 }, (_, i) => `k${String(i).padStart(2, "0")}`);
const jsonOrderChannel: CovertChannel = {
  name: "json-key-ordering",
  family: "canonicalizer",
  bits: 24,
  encode(secret) {
    const perm = permutationFromIndex(JSON_KEYS.length, bitsToInt(secret));
    const obj: Record<string, number> = {};
    for (const keyIndex of perm) {
      obj[JSON_KEYS[keyIndex]] = keyIndex;
    }
    return JSON.stringify(obj);
  },
  decode(text) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const order = Object.keys(parsed).map((k) => JSON_KEYS.indexOf(k));
      if (order.some((i) => i < 0) || order.length !== JSON_KEYS.length) {
        return padBits([], this.bits);
      }
      return intToBits(indexFromPermutation(order), this.bits);
    } catch {
      return padBits([], this.bits);
    }
  },
};

// --- base64 blob exfiltration -----------------------------------------------
const base64Channel: CovertChannel = {
  name: "base64-blob",
  family: "entropy",
  // 48 bytes -> a 64-char base64 run, a realistic exfil blob size.
  bits: 384,
  encode(secret) {
    const bytes = Buffer.alloc(secret.length / 8);
    for (let i = 0; i < bytes.length; i++) {
      let byte = 0;
      for (let b = 0; b < 8; b++) {
        byte = (byte << 1) | secret[i * 8 + b];
      }
      bytes[i] = byte;
    }
    return `status report ready ${bytes.toString("base64")}`;
  },
  decode(text) {
    const match = text.match(/[A-Za-z0-9+/]{16,}={0,2}/);
    if (!match) {
      return padBits([], this.bits);
    }
    try {
      const bytes = Buffer.from(match[0], "base64");
      const bits: Bit[] = [];
      for (const byte of bytes) {
        for (let b = 7; b >= 0; b--) {
          bits.push(((byte >> b) & 1) as Bit);
        }
      }
      return padBits(bits, this.bits);
    } catch {
      return padBits([], this.bits);
    }
  },
};

// --- synonym substitution: encode a bit in word choice within a ring ------
const synonymChannel: CovertChannel = {
  name: "synonym-substitution",
  family: "scrambler",
  bits: 24,
  encode(secret) {
    return secret
      .map((bit, i) => {
        const ring = SYNONYM_RINGS[i % SYNONYM_RINGS.length];
        return `the ${ring[bit]} result`;
      })
      .join(", ");
  },
  decode(text) {
    const words = [...text.matchAll(/the (\w+) result/g)].map((m) => m[1].toLowerCase());
    const bits: Bit[] = [];
    for (let i = 0; i < this.bits; i++) {
      const ring = SYNONYM_RINGS[i % SYNONYM_RINGS.length];
      const idx = words[i] ? ring.indexOf(words[i]) : -1;
      bits.push(idx >= 1 ? 1 : 0);
    }
    return bits;
  },
};

export const CONTENT_CHANNELS: CovertChannel[] = [
  zeroWidthChannel,
  unicodeTagChannel,
  variationSelectorChannel,
  bidiChannel,
  homoglyphChannel,
  whitespaceChannel,
  punctuationChannel,
  synonymChannel,
  jsonOrderChannel,
  base64Channel,
];
