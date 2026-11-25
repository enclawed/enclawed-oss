// enclawed adapter kit: rendering agent-controlled values inside Enclawed's
// own messages (approval prompts, refusal reasons, system messages).
//
// A path, a command, a tool name or a config line the agent (or a repository
// file) supplied must never add lines or wording to Enclawed's text. Every
// such value goes through quoteUntrusted, which strips invisible and bidi
// code points (and says how many), neutralizes imitations of an Enclawed
// notice, caps the length (a cut value ends with its full length and a short
// SHA-256, so two different long values never look the same), and JSON-quotes
// the result, also escaping the C1 controls and the line separators JSON
// leaves raw. Messages then label the quoted value as untrusted.
//
// Ported from codenclawed's untrusted.mjs.

import { createHash } from "node:crypto";
import { neutralizeNotices, stripHidden } from "./text-cleaner.js";

export const DEFAULT_QUOTE_MAX = 200;

/**
 * The text of a value from outside Enclawed (a hook payload, a settings
 * file, a record, a thrown value). A string is itself; a number, boolean,
 * bigint, null or undefined reads as String() reads it; a symbol as its
 * description form; an Error as "Name: message". Any other object is
 * serialized deliberately as JSON (a function, or a value JSON cannot
 * hold, as its type tag), never as "[object Object]", so two different
 * objects never read as the same text.
 */
export function textOf(value: unknown): string {
  switch (typeof value) {
    case "string":
      return value;
    case "number":
    case "boolean":
    case "bigint":
    case "undefined":
      return String(value);
    case "symbol":
      return value.toString();
    default:
      break;
  }
  if (value === null) {
    return "null";
  }
  if (value instanceof Error) {
    return String(value);
  }
  try {
    const json = JSON.stringify(value) as string | undefined;
    if (json !== undefined) {
      return json;
    }
  } catch {
    // a cycle or a BigInt inside: fall through to the type tag
  }
  return Object.prototype.toString.call(value);
}

function escapeUnit(c: number): string {
  return `\\u${c.toString(16).padStart(4, "0")}`;
}

// JSON.stringify leaves DEL, C1 controls and U+2028/2029 raw: escape them too.
function jsonQuote(s: string): string {
  const j = JSON.stringify(s);
  let out = "";
  for (let i = 0; i < j.length; i++) {
    const c = j.charCodeAt(i);
    out +=
      (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029 || c === 0xfffc || c === 0xfffd
        ? escapeUnit(c)
        : j[i];
  }
  return out;
}

/** One agent-controlled value, rendered for Enclawed's own messages: a JSON string literal, possibly with a note. */
export function quoteUntrusted(value: unknown, opts: { max?: number } = {}): string {
  const max = opts.max ?? DEFAULT_QUOTE_MAX;
  const raw = value === undefined ? "" : textOf(value);
  const { text, removed } = stripHidden(raw);
  const visible = neutralizeNotices(text).text;
  // Code points (not UTF-16 units, not graphemes): the cap counts what stripHidden counts.
  const cps = Array.from(visible);
  let shown = visible;
  let cut = "";
  if (cps.length > max) {
    shown = `${cps.slice(0, max).join("")}…`;
    cut = `${cps.length} characters, sha256 ${createHash("sha256").update(raw).digest("hex").slice(0, 12)}`;
  }
  const notes = [
    cut,
    removed ? `${removed} hidden character${removed === 1 ? "" : "s"} removed` : "",
  ].filter(Boolean);
  return `${jsonQuote(shown)}${notes.length ? ` (${notes.join("; ")})` : ""}`;
}

/** A path Enclawed computed: bare when it is plain printable ASCII, quoted otherwise. */
export function showPath(p: unknown): string {
  const s = textOf(p ?? "");
  let plain = s.length > 0 && !s.includes('"');
  for (let i = 0; plain && i < s.length; i++) {
    const c = s.charCodeAt(i);
    plain = c >= 0x21 && c <= 0x7e;
  }
  return plain ? s : quoteUntrusted(s, { max: 400 });
}

/**
 * Free text that mixes Enclawed's wording with values from elsewhere (an
 * error message): hidden characters stripped, controls and newlines escaped,
 * notice imitations neutralized, length capped. Not quoted.
 */
export function sanitizeText(
  value: unknown,
  opts: { max?: number; neutralize?: boolean } = {},
): string {
  const max = opts.max ?? 600;
  const { text } = stripHidden(textOf(value ?? ""));
  const base = opts.neutralize === false ? text : neutralizeNotices(text).text;
  let t = "";
  for (let i = 0; i < base.length; i++) {
    const c = base.charCodeAt(i);
    if (c === 0x0a) {
      t += "\\n";
    } else if (c === 0x09) {
      t += " ";
    } else if (c <= 0x1f || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029) {
      t += escapeUnit(c);
    } else {
      t += base[i];
    }
  }
  const cps = Array.from(t);
  if (cps.length > max) {
    t = `${cps.slice(0, max).join("")}… (${cps.length} characters)`;
  }
  return t;
}
