// enclawed adapter kit: a POSIX command line as the simple commands it runs
// (best effort, quote aware). Used by the rules that ask which programs a line
// starts (execution provenance, containment's program list, taint, file
// integrity, skill attribution, the host's own approval).
//
// It errs towards reading more text as commands, never less:
//   quotes          '...', "...", $'...' and backslash escapes are words, not
//                   commands; a $(...) or `...` inside double quotes is a
//                   command of its own (lexed recursively).
//   here-documents  <<WORD, <<'WORD', <<"WORD", <<\WORD, <<-WORD (leading tabs
//                   stripped): the body is read after the line, as the shell
//                   does, and is not a list of commands unless it reaches one:
//                     - given to a shell, or to a program not known to read
//                       its input as data or as other code: lexed as commands;
//                     - the program of a non-shell interpreter (python3 -,
//                       node -, perl, ruby, ...: no inline code, no script):
//                       code of that language, not commands;
//                     - data for a filter that only passes or summarizes it
//                       (cat, tee, head, ...): not commands, unless that
//                       output reaches code (a pipe, a process substitution,
//                       a group, or a substitution in command position or in
//                       an argument of a program that may run it);
//                   an unquoted body's $(...) and `...` run in the calling
//                   shell whatever the body is: always lexed as commands.
//   here-strings    <<< WORD: the word is input like a here-document's body.
//   arithmetic      no here-document is recognized inside $((...)) or ((...))
//                   (`1<<2` is a shift), nor after a comment's `#`.
// Each simple command keeps the here-documents and here-strings it reads
// (`heredocs`), so a rule can treat an interpreter's body as its code.

import path from "node:path";

export type HereDocBody = { body: string; expands: boolean; kind: "here-doc" | "here-string" };
export type Segment = {
  words: string[];
  pipedFromPrev: boolean;
  /** The here-documents and here-strings the command reads, in order. */
  heredocs?: HereDocBody[];
};

// Wrappers that run the command after their own options.
export const WRAPPERS: Readonly<Record<string, number>> = {
  sudo: 0,
  doas: 0,
  env: 0,
  nohup: 0,
  exec: 0,
  command: 0,
  builtin: 0,
  time: 0,
  nice: 0,
  ionice: 0,
  stdbuf: 0,
  setsid: 0,
  xargs: 0,
  timeout: 1,
  chronic: 0,
};

/** The program a simple command runs, and its arguments, after wrappers. */
export function programOf(words: readonly string[]): { prog: string; args: string[] } | null {
  let w = [...words];
  for (let guard = 0; guard < 8 && w.length; guard++) {
    // Leading variable assignments (FOO=1 cmd).
    while (w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0])) {
      w = w.slice(1);
    }
    if (!w.length) {
      return null;
    }
    const base = path.basename(w[0]);
    if (!Object.hasOwn(WRAPPERS, base)) {
      return { prog: base, args: w.slice(1) };
    }
    w = w.slice(1);
    while (w.length && w[0].startsWith("-")) {
      w = w.slice(1);
    }
    w = w.slice(WRAPPERS[base]);
  }
  return null;
}

export const INTERPRETERS: ReadonlySet<string> = new Set([
  "sh",
  "bash",
  "zsh",
  "dash",
  "ksh",
  "fish",
  "csh",
  "tcsh",
  "ash",
  "python",
  "python2",
  "python3",
  "node",
  "deno",
  "bun",
  "perl",
  "ruby",
  "php",
  "pwsh",
  "powershell",
  "source",
  ".",
  "eval",
]);

// Interpreters of another language that read their program from standard
// input when given no inline code and no script (`python3 -`, `node`, `perl`).
const NON_SHELL_STDIN_PROGRAM =
  /^(?:python[0-9.]*|pypy[0-9.]*|node|nodejs|perl|ruby|php|lua|luajit)$/;
// Options that give such an interpreter its code (or a module) some other way;
// a short cluster containing one of these letters counts. Over-matching only
// lexes the body as commands.
const INLINE_CODE_OPTION =
  /^-[A-Za-z]*[cemprxBERM]|^--(?:eval|print|require|module|command|import|run)/;

// Programs that only pass their input on or summarize it: a body given to
// them is data, unless their output reaches code.
const DATA_FILTERS: ReadonlySet<string> = new Set(
  "cat tee head tail wc tr cut base64 base32 md5sum sha1sum sha224sum sha256sum sha384sum sha512sum b2sum cksum od xxd hexdump nl fold rev tac paste column jq grep egrep fgrep uniq dd".split(
    " ",
  ),
);

// Programs whose arguments are data (a substitution in one is text, not code),
// unless one of the listed options says otherwise.
const DATA_ARGUMENTS: Readonly<Record<string, RegExp | null>> = {
  git: /^(?:-c|--config-env|--exec-path)(?:=|$)|^alias\./,
  gh: /^alias$/,
  glab: /^alias$/,
  echo: null,
  printf: null,
  jq: null,
  grep: null,
  egrep: null,
  fgrep: null,
  rg: null,
  curl: null,
  wget: null,
  cat: null,
  tee: null,
  head: null,
  tail: null,
  wc: null,
  test: null,
  "[": null,
};

const isAssignment = (w: string) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(w);

type HowBodyIsRead = "shell" | "other-code" | "data";

/** How the program of a simple command reads a here-document's body. */
function bodyReadBy(words: readonly string[]): HowBodyIsRead {
  const p = programOf(words);
  if (!p) {
    // `sudo -s <<EOF`, a body with no command: the shell's.
    return "shell";
  }
  if (DATA_FILTERS.has(p.prog)) {
    return "data";
  }
  if (NON_SHELL_STDIN_PROGRAM.test(p.prog)) {
    for (const a of p.args) {
      if (a === "-" || a === "--") {
        return "other-code";
      }
      if (!a.startsWith("-") || INLINE_CODE_OPTION.test(a)) {
        // A script or inline code reads the body as data, and may run it.
        return "shell";
      }
    }
    return "other-code";
  }
  return "shell";
}

/** Do a program's arguments stay data (a substitution in one is text, not code)? */
function argumentsAreData(words: readonly string[]): boolean {
  const p = programOf(words);
  if (!p) {
    // Only assignments (x=$(...)): the text is a variable's value.
    return words.length > 0 && words.every(isAssignment);
  }
  if (!Object.hasOwn(DATA_ARGUMENTS, p.prog)) {
    return false;
  }
  const unless = DATA_ARGUMENTS[p.prog];
  return !unless || !p.args.some((a) => unless.test(a));
}

// Where a substitution's output goes: the command it is a word of.
type Context = Readonly<{
  parent: Context | null;
  /** The words of the command the substitution is part of (complete once the line is read). */
  words: string[] | null;
  /** In command position (only assignments or wrappers before it): its output is run. */
  commandPosition: boolean;
  /** Inside a group, subshell or arithmetic of the enclosing command. */
  nested: boolean;
}>;

type Shared = {
  out: Segment[];
  pipesOut: WeakSet<string[]>;
  procSub: WeakSet<string[]>;
  deferred: Array<() => void>;
  /** How many substitutions deep the lexer is. */
  depth: number;
};

// Deeper than this, the rest of the text is split on every operator and
// quote and each piece taken for a command (more commands, never fewer).
const MAX_DEPTH = 64;

/** The rest of the text as commands, split on every operator, quote and bracket. */
function flatRest(text: string, from: number, st: Shared): number {
  for (const piece of text.slice(from).split(/[;&|()`\n{}<>$"'\\]+/)) {
    const words = piece.split(/[ \t]+/).filter(Boolean);
    if (words.length) {
      st.out.push({ words, pipedFromPrev: false });
    }
  }
  return text.length;
}

const TOP: Context = { parent: null, words: null, commandPosition: false, nested: false };

/** Can text produced in this context be run (as a command, or by a program that may run it)? */
function reachesCode(ctx: Context, st: Shared): boolean {
  for (let c: Context | null = ctx; c?.words; c = c.parent) {
    if (
      c.commandPosition ||
      c.nested ||
      st.pipesOut.has(c.words) ||
      st.procSub.has(c.words) ||
      !argumentsAreData(c.words)
    ) {
      return true;
    }
  }
  return false;
}

/** The simple commands of a line, with whether each reads the previous one's output. */
export function segments(command: string): Segment[] {
  const st: Shared = {
    out: [],
    pipesOut: new WeakSet(),
    procSub: new WeakSet(),
    deferred: [],
    depth: 0,
  };
  scan(command, 0, "top", st, TOP, 0);
  // Bodies whose reading depends on the whole line (a pipe after them, the
  // command their substitution is part of) are decided once it is read.
  for (let k = 0; k < st.deferred.length; k++) {
    st.deferred[k]();
  }
  return st.out;
}

type Pending = {
  delim: string;
  strip: boolean;
  doc: HereDocBody;
  owner: string[];
  ctx: Context;
  nested: boolean;
};

/** scanText with a bound on nesting (a line of thousands of `$(` would exhaust the stack). */
function scan(
  text: string,
  from: number,
  mode: "top" | "subst" | "backtick",
  st: Shared,
  ctx: Context,
  arith: number,
): number {
  if (st.depth >= MAX_DEPTH) {
    return flatRest(text, from, st);
  }
  st.depth++;
  try {
    return scanText(text, from, mode, st, ctx, arith);
  } finally {
    st.depth--;
  }
}

/**
 * Lexes text from `from`. "top" runs to the end; "subst" stops at the `)`
 * closing a `$(` or `<(` (its index is returned); "backtick" stops at the
 * closing backtick. `arith` opens the scan inside `$((`.
 */
function scanText(
  text: string,
  from: number,
  mode: "top" | "subst" | "backtick",
  st: Shared,
  ctx: Context,
  arith: number,
): number {
  let words: string[] = [];
  let docs: HereDocBody[] = [];
  let strings: string[] = [];
  let cur = "";
  let inWord = false;
  let quote: "'" | '"' | "$'" | null = null;
  let piped = false;
  let hereStringNext = false;
  // Open (...) and ((...)) of this scan; "a" marks arithmetic.
  const stack: Array<"p" | "a"> = [];
  for (let k = 0; k < arith; k++) {
    stack.push("a");
  }
  let braces = 0;
  let caseDepth = 0;
  let comment = false;
  const pending: Pending[] = [];

  const endWord = () => {
    if (inWord) {
      if (words.every(isAssignment)) {
        if (cur === "case") {
          caseDepth++;
        } else if (cur === "esac" && caseDepth > 0) {
          caseDepth--;
        }
      }
      if (hereStringNext) {
        strings.push(cur);
        docs.push({ body: cur, expands: false, kind: "here-string" });
        hereStringNext = false;
      }
      words.push(cur);
    }
    cur = "";
    inWord = false;
  };
  const endSeg = (nextPiped: boolean) => {
    endWord();
    if (words.length) {
      const seg: Segment = { words, pipedFromPrev: piped };
      if (docs.length) {
        seg.heredocs = docs;
      }
      st.out.push(seg);
      if (nextPiped) {
        st.pipesOut.add(words);
      }
      const owner = words;
      const nested = stack.length > 0 || braces > 0;
      for (const s of strings) {
        const c = ctx;
        st.deferred.push(() => readBody(s, false, owner, c, nested));
      }
    }
    words = [];
    docs = [];
    strings = [];
    piped = nextPiped;
    hereStringNext = false;
  };
  // A body (or here-string) read by `owner`'s program, lexed as commands when it reaches the shell.
  const readBody = (
    body: string,
    expands: boolean,
    owner: string[],
    c: Context,
    nested: boolean,
  ) => {
    const how = bodyReadBy(owner);
    const shell =
      how === "shell" ||
      (how === "data" &&
        (nested || st.pipesOut.has(owner) || st.procSub.has(owner) || reachesCode(c, st)));
    if (shell) {
      scan(body, 0, "top", st, TOP, 0);
    } else if (expands) {
      substitutionsIn(body, st, c);
    }
  };
  // The command a substitution starting now belongs to.
  const childContext = (): Context => ({
    parent: ctx,
    words,
    commandPosition: programOf(words) === null && !(inWord && isAssignment(cur)),
    nested: stack.length > 0 || braces > 0,
  });

  let i = from;
  for (; i < text.length; i++) {
    const c = text[i];
    if (quote === "'") {
      if (c === "'") {
        quote = null;
      } else {
        cur += c;
      }
      continue;
    }
    if (quote === "$'") {
      if (c === "\\") {
        cur += text[i + 1] ?? "";
        i++;
      } else if (c === "'") {
        quote = null;
      } else {
        cur += c;
      }
      continue;
    }
    if (quote === '"') {
      if (c === '"') {
        quote = null;
      } else if (c === "\\" && /[$`"\\\n]/.test(text[i + 1] ?? "")) {
        if (text[i + 1] !== "\n") {
          cur += text[i + 1];
        }
        i++;
      } else if (c === "$" && text[i + 1] === "(") {
        // A substitution inside double quotes runs a command too.
        const a = text[i + 2] === "(" ? 1 : 0;
        i = scan(text, i + 2 + a, "subst", st, childContext(), a);
      } else if (c === "`") {
        i = scan(text, i + 1, "backtick", st, childContext(), 0);
      } else {
        cur += c;
      }
      continue;
    }
    if (c === "\\") {
      if (text[i + 1] === "\n") {
        i++;
      } else if (i + 1 < text.length) {
        cur += text[i + 1];
        inWord = true;
        i++;
      }
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      inWord = true;
    } else if (c === "$" && text[i + 1] === "'") {
      quote = "$'";
      inWord = true;
      i++;
    } else if (c === " " || c === "\t") {
      endWord();
    } else if (c === "\n") {
      endSeg(false);
      comment = false;
      if (pending.length) {
        i = readBodies(text, i + 1, pending, mode, stack.length > 0) - 1;
        for (const p of pending.splice(0)) {
          const { doc, owner, ctx: pc, nested } = p;
          st.deferred.push(() => readBody(doc.body, doc.expands, owner, pc, nested));
        }
      }
    } else if (c === "|" && text[i + 1] === "|") {
      endSeg(false);
      i++;
    } else if (c === "|") {
      // `|&` pipes standard error too.
      endSeg(true);
      if (text[i + 1] === "&") {
        i++;
      }
    } else if (
      c === "&" &&
      (text[i + 1] === ">" || ((text[i - 1] === ">" || text[i - 1] === "<") && inWord))
    ) {
      // A redirection (`&>`, `2>&1`, `<&3`), not a list operator.
      cur += c;
      inWord = true;
    } else if (c === "&" || c === ";") {
      endSeg(false);
    } else if (c === "(") {
      endSeg(false);
      if (text[i + 1] === "(") {
        stack.push("a", "a");
        i++;
      } else {
        stack.push("p");
      }
    } else if (c === ")") {
      if (stack.length === 0 && mode === "subst" && caseDepth === 0) {
        endSeg(false);
        return i;
      }
      endSeg(false);
      stack.pop();
    } else if (c === "`") {
      if (mode === "backtick") {
        endSeg(false);
        return i;
      }
      const child = childContext();
      inWord = true;
      i = scan(text, i + 1, "backtick", st, child, 0);
    } else if (c === "$" && text[i + 1] === "{") {
      // A parameter expansion is part of the word; substitutions in it run.
      const child = childContext();
      const end = parameterExpansionEnd(text, i + 2, st, child);
      cur += text.slice(i, end + 1);
      inWord = true;
      i = end;
    } else if (c === "$" && text[i + 1] === "(") {
      const child = childContext();
      inWord = true;
      const a = text[i + 2] === "(" ? 1 : 0;
      i = scan(text, i + 2 + a, "subst", st, child, a);
    } else if ((c === "<" || c === ">") && text[i + 1] === "(") {
      // Process substitution: what follows is a command of its own.
      st.procSub.add(words);
      const child = childContext();
      inWord = true;
      i = scan(text, i + 2, "subst", st, child, 0);
    } else if (c === "{" || c === "}") {
      if (!inWord && c === "{" && /[\s]/.test(text[i + 1] ?? "")) {
        braces++;
      } else if (!inWord && c === "}" && braces > 0) {
        braces--;
      }
      endSeg(false);
    } else if (c === "<" && text[i + 1] === "<" && text[i + 2] === "<") {
      endWord();
      words.push("<<<");
      hereStringNext = true;
      i += 2;
    } else if (c === "<" && text[i + 1] === "<" && !comment && !stack.includes("a")) {
      const hd = hereDocOperator(text, i);
      if (!hd) {
        cur += c;
        inWord = true;
        continue;
      }
      if (inWord && /^\d+$/.test(cur)) {
        // A descriptor number (0<<EOF): part of the operator.
        cur = "";
        inWord = false;
      } else {
        endWord();
      }
      const doc: HereDocBody = { body: "", expands: hd.expands, kind: "here-doc" };
      docs.push(doc);
      pending.push({
        delim: hd.delim,
        strip: hd.strip,
        doc,
        owner: words,
        ctx,
        nested: stack.length > 0 || braces > 0,
      });
      i = hd.end - 1;
    } else {
      if (c === "#" && !inWord) {
        // A comment (or ${#x}, read the same way): no here-document after it on this line.
        comment = true;
      }
      cur += c;
      inWord = true;
    }
  }
  endSeg(false);
  if (pending.length) {
    // Here-documents with no line after them: empty bodies.
    for (const p of pending.splice(0)) {
      const { doc, owner, ctx: pc, nested } = p;
      st.deferred.push(() => readBody(doc.body, doc.expands, owner, pc, nested));
    }
  }
  return i;
}

/** The operator `<<[-]WORD` at text[i]: its delimiter, whether the body expands, where it ends. */
function hereDocOperator(
  text: string,
  i: number,
): { delim: string; strip: boolean; expands: boolean; end: number } | null {
  let j = i + 2;
  const strip = text[j] === "-";
  if (strip) {
    j++;
  }
  while (text[j] === " " || text[j] === "\t") {
    j++;
  }
  let delim = "";
  let quoted = false;
  while (j < text.length && !/[\s;&|<>()]/.test(text[j])) {
    const c = text[j];
    if (c === "'" || c === '"') {
      quoted = true;
      const close = text.indexOf(c, j + 1);
      if (close < 0) {
        return null;
      }
      delim += text.slice(j + 1, close);
      j = close + 1;
    } else if (c === "\\") {
      quoted = true;
      delim += text[j + 1] ?? "";
      j += 2;
    } else {
      delim += c;
      j++;
    }
  }
  if (!delim) {
    return null;
  }
  return { delim, strip, expands: !quoted, end: j };
}

/**
 * Reads the bodies of the here-documents of a line, from text[from], in
 * order. Returns the index where lexing resumes. Inside $(...) or `...`, a
 * line that is the delimiter followed by the closing `)` or backtick also
 * ends the body (bash accepts it); a body with no delimiter line runs to the
 * end of the text (the shell then has nothing after it to run).
 */
function readBodies(
  text: string,
  from: number,
  pending: Pending[],
  mode: "top" | "subst" | "backtick",
  inParen: boolean,
): number {
  let pos = from;
  for (const p of pending) {
    let body = "";
    for (;;) {
      if (pos >= text.length) {
        break;
      }
      const eol = text.indexOf("\n", pos);
      const end = eol < 0 ? text.length : eol;
      const line = text.slice(pos, end);
      const tabs = p.strip ? (/^\t*/.exec(line)?.[0].length ?? 0) : 0;
      const cmp = line.slice(tabs);
      if (cmp === p.delim) {
        pos = eol < 0 ? text.length : eol + 1;
        break;
      }
      if (cmp.startsWith(p.delim)) {
        const rest = cmp.slice(p.delim.length);
        const closer = /^[ \t]*([)`])/.exec(rest);
        if (
          closer &&
          ((closer[1] === ")" && (mode === "subst" || inParen)) ||
            (closer[1] === "`" && mode === "backtick"))
        ) {
          // Resume at the closing character.
          pos = pos + tabs + p.delim.length + closer[0].length - 1;
          p.doc.body = body;
          return finishRest(text, pos, pending, p);
        }
      }
      body += `${cmp}\n`;
      pos = end + 1;
    }
    p.doc.body = body;
  }
  return Math.min(pos, text.length);
}

// A body ended by `DELIM)`: the here-documents after it on the line have no body.
function finishRest(_text: string, pos: number, pending: Pending[], last: Pending): number {
  for (let k = pending.indexOf(last) + 1; k < pending.length; k++) {
    pending[k].doc.body = "";
  }
  return pos;
}

/** The index of the `}` closing `${` (text[from] is just after it); runs the substitutions inside. */
function parameterExpansionEnd(text: string, from: number, st: Shared, ctx: Context): number {
  if (st.depth >= MAX_DEPTH) {
    return flatRest(text, from, st) - 1;
  }
  st.depth++;
  try {
    return parameterExpansionBody(text, from, st, ctx);
  } finally {
    st.depth--;
  }
}

function parameterExpansionBody(text: string, from: number, st: Shared, ctx: Context): number {
  let depth = 1;
  for (let k = from; k < text.length; k++) {
    const c = text[k];
    if (c === "\\") {
      k++;
    } else if (c === "'") {
      const close = text.indexOf("'", k + 1);
      k = close < 0 ? text.length : close;
    } else if (c === '"') {
      for (k++; k < text.length && text[k] !== '"'; k++) {
        if (text[k] === "\\") {
          k++;
        } else if (text[k] === "$" && text[k + 1] === "(") {
          const a = text[k + 2] === "(" ? 1 : 0;
          k = scan(text, k + 2 + a, "subst", st, ctx, a);
        } else if (text[k] === "`") {
          k = scan(text, k + 1, "backtick", st, ctx, 0);
        } else if (text[k] === "$" && text[k + 1] === "{") {
          k = parameterExpansionEnd(text, k + 2, st, ctx);
        }
      }
    } else if (c === "$" && text[k + 1] === "(") {
      const a = text[k + 2] === "(" ? 1 : 0;
      k = scan(text, k + 2 + a, "subst", st, ctx, a);
    } else if (c === "`") {
      k = scan(text, k + 1, "backtick", st, ctx, 0);
    } else if (c === "$" && text[k + 1] === "{") {
      depth++;
      k++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) {
        return k;
      }
    }
  }
  return text.length - 1;
}

/** The commands an unquoted body's substitutions run (quotes are text in a body). */
function substitutionsIn(body: string, st: Shared, ctx: Context): void {
  const here: Context = { parent: ctx, words: null, commandPosition: false, nested: false };
  for (let k = 0; k < body.length; k++) {
    const c = body[k];
    if (c === "\\") {
      k++;
    } else if (c === "$" && body[k + 1] === "(") {
      const a = body[k + 2] === "(" ? 1 : 0;
      k = scan(body, k + 2 + a, "subst", st, here, a);
    } else if (c === "`") {
      k = scan(body, k + 1, "backtick", st, here, 0);
    }
  }
}
