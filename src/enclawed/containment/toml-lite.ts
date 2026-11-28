// A small TOML reader for one purpose: comparing two versions of a
// manifest (pyproject.toml) structurally, so the install cage
// (./install-guard.ts) can tell "only the dependency tables changed" from
// "something else changed". Strings are decoded; other scalars (numbers,
// booleans, dates) are kept as their normalized source text, which is
// enough to compare. Anything it cannot read throws: the caller then treats
// the manifest as changed (fail closed).

/** A number, boolean or date, as its normalized source text. */
export class TomlScalar {
  constructor(readonly raw: string) {}
}
export type TomlValue = string | TomlScalar | TomlValue[] | TomlTable;
export type TomlTable = { [k: string]: TomlValue };

class Reader {
  i = 0;
  constructor(readonly s: string) {}
  peek(n = 0) {
    return this.s[this.i + n] ?? "";
  }
  startsWith(t: string) {
    return this.s.startsWith(t, this.i);
  }
  fail(msg: string): never {
    const line = this.s.slice(0, this.i).split("\n").length;
    throw new Error(`toml: ${msg} at line ${line}`);
  }
  /** Spaces and tabs. */
  ws() {
    while (this.peek() === " " || this.peek() === "\t") {
      this.i++;
    }
  }
  /** Whitespace, newlines and comments (inside arrays). */
  wsnl() {
    for (;;) {
      this.ws();
      if (this.peek() === "#") {
        while (this.i < this.s.length && this.peek() !== "\n") {
          this.i++;
        }
      } else if (this.peek() === "\n" || this.startsWith("\r\n")) {
        this.i += this.peek() === "\n" ? 1 : 2;
      } else {
        return;
      }
    }
  }
  /** End of a line: optional comment, then newline or end of input. */
  eol() {
    this.ws();
    if (this.peek() === "#") {
      while (this.i < this.s.length && this.peek() !== "\n") {
        this.i++;
      }
    }
    if (this.startsWith("\r\n")) {
      this.i += 2;
    } else if (this.peek() === "\n") {
      this.i++;
    } else if (this.i < this.s.length) {
      this.fail("expected the end of the line");
    }
  }
}

const ESC: Record<string, string> = {
  b: "\b",
  t: "\t",
  n: "\n",
  f: "\f",
  r: "\r",
  '"': '"',
  "\\": "\\",
};

function basicString(r: Reader, multi: boolean): string {
  let out = "";
  r.i += multi ? 3 : 1;
  if (multi && r.peek() === "\n") {
    r.i++;
  } else if (multi && r.startsWith("\r\n")) {
    r.i += 2;
  }
  for (;;) {
    if (r.i >= r.s.length) {
      r.fail("unterminated string");
    }
    if (multi ? r.startsWith('"""') : r.peek() === '"') {
      // Up to two quotes may end a multi-line string's content.
      let q = 0;
      if (multi) {
        while (r.peek(3 + q) === '"' && q < 2) {
          q++;
        }
        out += '"'.repeat(q);
        r.i += 3 + q;
      } else {
        r.i++;
      }
      return out;
    }
    const c = r.peek();
    if (!multi && c === "\n") {
      r.fail("newline in a string");
    }
    if (c === "\\") {
      const e = r.peek(1);
      if (multi && (e === "\n" || e === " " || e === "\t" || e === "\r")) {
        // Line-ending backslash: trim whitespace through the next non-space.
        r.i++;
        while (/[ \t\r\n]/.test(r.peek())) {
          r.i++;
        }
        continue;
      }
      if (ESC[e] !== undefined) {
        out += ESC[e];
        r.i += 2;
        continue;
      }
      if (e === "u" || e === "U") {
        const n = e === "u" ? 4 : 8;
        const hex = r.s.slice(r.i + 2, r.i + 2 + n);
        if (!new RegExp(`^[0-9a-fA-F]{${n}}$`).test(hex)) {
          r.fail("bad unicode escape");
        }
        out += String.fromCodePoint(parseInt(hex, 16));
        r.i += 2 + n;
        continue;
      }
      r.fail("bad escape");
    }
    out += c;
    r.i++;
  }
}

function literalString(r: Reader, multi: boolean): string {
  r.i += multi ? 3 : 1;
  if (multi && r.peek() === "\n") {
    r.i++;
  } else if (multi && r.startsWith("\r\n")) {
    r.i += 2;
  }
  const end = multi ? "'''" : "'";
  const j = r.s.indexOf(end, r.i);
  if (j < 0) {
    r.fail("unterminated literal string");
  }
  let k = j;
  if (multi) {
    while (r.s[k + 3] === "'" && k - j < 2) {
      k++;
    }
  }
  const out = r.s.slice(r.i, k);
  if (!multi && out.includes("\n")) {
    r.fail("newline in a literal string");
  }
  r.i = k + end.length;
  return out;
}

function key(r: Reader): string[] {
  const parts: string[] = [];
  for (;;) {
    r.ws();
    if (r.peek() === '"') {
      parts.push(basicString(r, false));
    } else if (r.peek() === "'") {
      parts.push(literalString(r, false));
    } else {
      const m = /^[A-Za-z0-9_-]+/.exec(r.s.slice(r.i));
      if (!m) {
        r.fail("bad key");
      }
      parts.push(m[0]);
      r.i += m[0].length;
    }
    r.ws();
    if (r.peek() !== ".") {
      return parts;
    }
    r.i++;
  }
}

function arrayValue(r: Reader): TomlValue[] {
  r.i++;
  const arr: TomlValue[] = [];
  for (;;) {
    r.wsnl();
    if (r.peek() === "]") {
      r.i++;
      return arr;
    }
    arr.push(value(r));
    r.wsnl();
    if (r.peek() === ",") {
      r.i++;
    } else if (r.peek() !== "]") {
      r.fail("expected , or ] in an array");
    }
  }
}

function inlineTable(r: Reader): TomlTable {
  r.i++;
  const t: TomlTable = {};
  r.ws();
  if (r.peek() === "}") {
    r.i++;
    return t;
  }
  for (;;) {
    const k = key(r);
    if (r.peek() !== "=") {
      r.fail("expected = in an inline table");
    }
    r.i++;
    put(r, t, k, value(r));
    r.ws();
    if (r.peek() === ",") {
      r.i++;
      continue;
    }
    if (r.peek() === "}") {
      r.i++;
      return t;
    }
    r.fail("expected , or } in an inline table");
  }
}

function value(r: Reader): TomlValue {
  r.ws();
  if (r.startsWith('"""')) {
    return basicString(r, true);
  }
  if (r.peek() === '"') {
    return basicString(r, false);
  }
  if (r.startsWith("'''")) {
    return literalString(r, true);
  }
  if (r.peek() === "'") {
    return literalString(r, false);
  }
  if (r.peek() === "[") {
    return arrayValue(r);
  }
  if (r.peek() === "{") {
    return inlineTable(r);
  }
  const m = /^[^\s,\]}#]+/.exec(r.s.slice(r.i));
  if (!m) {
    r.fail("expected a value");
  }
  let raw = m[0];
  r.i += raw.length;
  // A date-time may hold one space between date and time.
  const more = /^ \d{2}:\d{2}(:\d{2}(\.\d+)?)?([Zz]|[+-]\d{2}:\d{2})?/.exec(r.s.slice(r.i));
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && more) {
    raw += `T${more[0].slice(1)}`;
    r.i += more[0].length;
  }
  return new TomlScalar(raw.replace(/_/g, ""));
}

const isTable = (v: TomlValue | undefined): v is TomlTable =>
  !!v && typeof v === "object" && !Array.isArray(v) && !(v instanceof TomlScalar);

function descend(r: Reader, t: TomlTable, path: string[]): TomlTable {
  let cur = t;
  for (const p of path) {
    let next = cur[p];
    if (next === undefined) {
      next = {};
      cur[p] = next;
    }
    if (Array.isArray(next)) {
      const last = next[next.length - 1];
      if (!isTable(last)) {
        r.fail(`${p} is not a table`);
      }
      next = last;
    }
    if (!isTable(next)) {
      r.fail(`${p} is not a table`);
    }
    cur = next;
  }
  return cur;
}

function put(r: Reader, t: TomlTable, k: string[], v: TomlValue) {
  const parent = descend(r, t, k.slice(0, -1));
  const last = k[k.length - 1];
  if (last in parent) {
    r.fail(`duplicate key ${k.join(".")}`);
  }
  parent[last] = v;
}

/** Parse a TOML document. Throws on anything it cannot read. */
export function parseToml(text: string): TomlTable {
  const r = new Reader(text.replace(/^﻿/, ""));
  const root: TomlTable = {};
  let cur = root;
  for (;;) {
    r.wsnl();
    if (r.i >= r.s.length) {
      return root;
    }
    if (r.startsWith("[[")) {
      r.i += 2;
      const k = key(r);
      if (!r.startsWith("]]")) {
        r.fail("expected ]]");
      }
      r.i += 2;
      const parent = descend(r, root, k.slice(0, -1));
      const last = k[k.length - 1];
      const existing = parent[last];
      const arr: TomlValue[] = existing === undefined ? [] : (existing as TomlValue[]);
      parent[last] = arr;
      if (!Array.isArray(arr)) {
        r.fail(`${k.join(".")} is not an array of tables`);
      }
      const t: TomlTable = {};
      arr.push(t);
      cur = t;
      r.eol();
    } else if (r.peek() === "[") {
      r.i++;
      const k = key(r);
      if (r.peek() !== "]") {
        r.fail("expected ]");
      }
      r.i++;
      cur = descend(r, root, k);
      r.eol();
    } else {
      const k = key(r);
      if (r.peek() !== "=") {
        r.fail("expected =");
      }
      r.i++;
      put(r, cur, k, value(r));
      r.eol();
    }
  }
}
