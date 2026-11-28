// enclawed adapter kit: a POSIX command line as the list of simple commands
// the shell will run, or a refusal.
//
// The grammar accepted is a strict subset of the shell's: simple commands
// joined by `;`, `&&`, `||`, `|` and newlines; words made of unquoted text,
// '...' and "..." with backslash escapes; leading NAME=VALUE assignments; and
// only these redirections: a descriptor duplicated onto another (2>&1, >&2,
// 1>&2) and anything sent to or read from /dev/null (>/dev/null, 2>/dev/null,
// &>/dev/null, >>/dev/null, </dev/null). The only expansions are the ones
// whose value is known when the command is decided: `~` and `~/...` at the
// start of an unquoted word (the home directory) and $HOME / ${HOME} and
// $PWD / ${PWD} (the directory the command runs in at that point, `cd`
// followed), and a `for` loop's variable (below).
//
// Also read exactly, because what they run is known:
//   - `for NAME in WORDS; do LIST; done`: LIST once per word, NAME bound to
//     that word's text (a glob stays the pattern, as the same glob written
//     in place would be); a word list with an unknown value is refused;
//   - `( LIST )`, a subshell: its `cd` does not reach the commands after it;
//   - `{ LIST; }`, a brace group: its `cd` reaches the commands after it
//     (unless the group feeds a pipeline); not after a `|`;
//   - `"$(cat <<'EOF' ... EOF)"`: the here-document's literal text;
//   - `$(LIST)` and `$?`, values the kit cannot know, only as an argument of
//     echo, printf, test or `[` (which only print or compare it); the
//     substitution's own commands are returned in front of the command that
//     uses them, so every rule decides them too;
//   - `!` inside a word or as an argument (the host's shell is not
//     interactive: there is no history expansion, `!` is literal there);
//   - `{}` as a word (find -exec's placeholder; no brace expansion).
// With `fileRedirects` (the engine's own parse), redirections to and from
// files and here-documents are returned on the command (writes, reads,
// stdin) for the engine to decide; without it they are refused, so a caller
// that does not look at them never misses one.
//
// Everything else a shell could turn into another command, a file write or
// an unknown value is refused: process substitution, other variables,
// background jobs, other redirections, brace expansion, comments.
//
// `cd DIR` (a literal directory, after the expansions above) changes the
// working directory of the commands after it in the same list, as the shell
// does; in a pipeline each part is its own process, so a `cd` there is
// refused. Each simple command is returned with the directory it runs in, so
// every rule that resolves a path resolves it where the shell would.

import path from "node:path";
import { credentialLike } from "./env-trust.js";

export type Redirect = Readonly<{ text: string }>;

/** A file a command's output is written to (`>`, `>>`, `2>`, `&>`), its text resolved. */
export type FileWrite = Readonly<{
  path: string;
  append: boolean;
  /** What is written there: standard output (`>`, `1>`), standard error (`2>`), or both (`&>`). */
  stream: "out" | "err" | "both";
}>;

export type SimpleCommand = Readonly<{
  /** The command's words, quotes removed and the known expansions applied. */
  argv: readonly string[];
  /**
   * For each word of argv, whether the shell expands it as a file pattern (an
   * unquoted *, ? or [): absent when none does. argv holds the pattern itself.
   */
  globbed?: readonly boolean[];
  /** Leading NAME=VALUE assignments (values expanded). */
  assigns: readonly Readonly<{ name: string; value: string }>[];
  /**
   * The word the shell looks up as the command (after the assignments), as
   * written: its text, and whether it is unquoted literal text (only such a
   * word is read as an alias). Absent: the command runs nothing (NAME=VALUE
   * alone). `argv[0]` may differ (`cd A B` is returned as `false`).
   */
  commandWord?: Readonly<{ name: string; aliasable: boolean }>;
  /** The redirections it carries (all of the accepted kinds, file ones included). */
  redirects: readonly Redirect[];
  /** The absolute directory the command runs in when every `cd` before it succeeded. */
  cwd: string;
  /**
   * Every directory it may run in: a `cd` that fails (a missing directory)
   * leaves the shell where it was, and the commands after a `;`, a newline
   * or a `||` still run, there. Path rules check each of them.
   */
  cwds: readonly string[];
  /** Whether its input comes from the previous command's output (a pipeline). */
  piped: boolean;
  /** How it joins the next command (null for the last one). */
  next: ";" | "&&" | "||" | "|" | null;
  /** fileRedirects only: the files its output is written to. */
  writes?: readonly FileWrite[];
  /** fileRedirects only: the files it reads as its input (`< FILE`). */
  reads?: readonly string[];
  /** fileRedirects only: a here-document's literal text, its standard input. */
  stdin?: string | null;
  /** Some argument's value is unknown ($?, $(...), a variable); only echo, printf, test and `[` take one. */
  unknownArgs?: boolean;
  /** File names it is given from a listed set (`cat $(git ls-files)`): every file there is checked. */
  filesets?: readonly Fileset[];
  /** `export NAME=VALUE ...` the parser read (exportedName): the line's variables, exported. */
  exports?: readonly Readonly<{ name: string; value: string }>[];
  /**
   * xargs fed by `find ... -print0 | xargs -0`: the names it appends are exactly the
   * files the find lists (also in `filesets`, so every one is checked).
   */
  xargsListed?: boolean;
  /**
   * Indices (in the returned list) of earlier commands that must each have
   * exited 0 for this one to run: the commands before it in its `&&` chain
   * (a compound adds none of its own, only what it required), a command
   * followed by `|| exit` (a failure ends the shell), and under `set -e`
   * every earlier plain command whose failure ends the shell. Exact; a
   * command of a `$(...)` is never one of them.
   */
  requires?: readonly number[];
}>;

export type CompoundParse =
  | Readonly<{ ok: true; commands: readonly SimpleCommand[] }>
  | Readonly<{ ok: false; code: string; detail?: string }>;

export type ShellContext = Readonly<{
  cwd: string;
  home: string | null;
  /** The top of the git work tree `dir` is in (`git rev-parse --show-toplevel`), when known. */
  gitTop?: (dir: string) => string | null;
  /**
   * The environment the line's shell starts with (the session's). `$NAME` takes its
   * value from here when the name is not credential-shaped and the line does not
   * set, export, unset or read it (nor source or eval anything that could).
   */
  env?: Readonly<Record<string, string>> | null;
  /**
   * Exact argument vectors of the host application's own CLI that it declares
   * read-only (EngineOptions.hostReadOnlyCommands): a simple command whose
   * words are exactly one of them is read-only (classifyCompound).
   */
  readOnlyArgv?: readonly (readonly string[])[] | null;
  /** The session's whole environment (set by parseCompound: `env` leaves out what the line touches). */
  exported?: Readonly<Record<string, string>> | null;
}>;

/**
 * A path component whose value is unknown but drawn from a fixed alphabet (digits
 * and . _ : -), such as `$(date +%F)`. It never holds `/`, a blank or a glob
 * character; the engine decides a word holding it only when no existing entry
 * of its directory could be that component (./engine.ts).
 */
export const OPAQUE = "\uE000";
/** The names an OPAQUE component may take. */
export const OPAQUE_NAMES = /^[0-9._:-]+$/;
/** As OPAQUE, a lower-case hexadecimal object id (`git hash-object`): [0-9a-f]+. */
export const OPAQUE_HEX = "\uE001";

// date +FORMAT with only numeric conversions and . _ : - : its output is in OPAQUE_NAMES.
const DATE_FORMAT = /^\+(?:%[YmdFHMSjsuVGgCye]|[._:-])+$/;

/** The value a pure command prints, when the kit knows it or its alphabet: date, basename, dirname. */
function pureValue(cmds: readonly SimpleCommand[]): string | null {
  if (cmds.length !== 1 || cmds[0].unknownArgs || cmds[0].assigns.length) {
    return null;
  }
  const [prog, ...args] = cmds[0].argv;
  if (prog === "date" && args.length === 1 && DATE_FORMAT.test(args[0])) {
    return OPAQUE;
  }
  // git hash-object without -w: one object id (the read-only allowlist decides the rest of its form).
  if (
    prog === "git" &&
    args[0] === "hash-object" &&
    !args.some((a) => a === "-w" || a.startsWith("--stdin"))
  ) {
    return OPAQUE_HEX;
  }
  if (
    (prog === "basename" || prog === "dirname") &&
    args.length === 1 &&
    !args[0].startsWith("-")
  ) {
    const a = args[0].replace(/\/+$/, "") || "/";
    return prog === "basename" ? path.posix.basename(a) || "/" : path.posix.dirname(a);
  }
  return null;
}

/** The value `$name` has from the line's starting environment, when the kit may use it. */
function envValue(ctx: ShellContext, name: string): string | null {
  const env = ctx.env;
  if (!env || !Object.hasOwn(env, name) || credentialLike(name)) {
    return null;
  }
  return env[name];
}

/** The environment a line may read: names it sets, exports, unsets or reads left out; none when it sources or evals. */
function lineEnv(command: string, env: ShellContext["env"]): ShellContext["env"] {
  if (!env) {
    return null;
  }
  // `export NAME=...` is read by the parser (exportedName); any other export form is not.
  const plain = command.replace(/(?:^|(?<=[\s;&|(`]))export(?=\s+[A-Za-z_][A-Za-z0-9_]*=)/g, "");
  if (
    /(?:^|[\s;&|(`])(?:source|eval|export|unset|declare|typeset|local|readonly|read|\.)(?=\s|$)/.test(
      plain,
    ) ||
    // set with positional words or -a (export everything); set -e / -u / -x / -o pipefail change no variable.
    /(?:^|[\s;&|(`])set\s+(?:--|[-+][A-Za-z]*a|[^-+\s])/.test(command)
  ) {
    return null;
  }
  const out: Record<string, string> = { ...env };
  for (const m of command.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\+?=/g)) {
    delete out[m[1]];
  }
  return out;
}

export type CompoundOptions = Readonly<{
  /** Return redirections to and from files and here-documents on the command (else refused). */
  fileRedirects?: boolean;
  /**
   * The shell that runs the text, when it is known: dash (sh) leaves braces
   * literal and bash expands them, so a brace form (`{a,b}`, `{a,}`, `{a..b}`)
   * is refused in dash text and a sequence (`{a..b}`, not expanded here) in
   * bash text. Unset: bash's alternatives are expanded as before.
   */
  shell?: "dash" | "bash";
}>;

const MAX_LEN = 16 * 1024;
const MAX_COMMANDS = 64;
const MAX_NESTING = 4;

type Part = {
  s: string;
  quoted: boolean;
  /** A variable: HOME, PWD or a `for` loop's name. */
  variable?: string;
  split?: boolean;
  /** A value the kit cannot know: `$?`, or `$(sub)` (whose commands still run). */
  unknown?: boolean;
  sub?: string;
  /** A brace expansion's alternatives (`{a,b}`): the word becomes one word per alternative. */
  brace?: readonly string[];
  /** The files a `$(git ls-files ...)` or `$(find ...)` lists (set when its commands are read). */
  fileset?: Fileset;
  /** `${NAME:-WORD}` / `${NAME-WORD}`: the literal WORD, and whether an empty value takes it too (`:-`). */
  dflt?: Readonly<{ word: string; colon: boolean }>;
};

/**
 * Files a substitution lists: a subset of every file below `roots` (git ls-files
 * lists the index, find what it walks; grep, head, tail, sort and uniq only drop
 * or reorder names). The engine checks every file there before the command runs.
 */
export type Fileset = Readonly<{
  /** Every directory the listing starts from, in each directory it may run in. */
  roots: readonly string[];
  source: "git ls-files" | "find" | "grep -l";
  /** grep --include: files found below a root are only those whose name matches one (absent: all). */
  include?: readonly string[];
  /** find: its start words as given and its expression; a file it can never print is not listed (./find-expr.ts). */
  find?: Readonly<{ starts: readonly string[]; expr: readonly string[] }>;
  /** The directories the listing may run in (its names are relative to the one it ran in). */
  bases: readonly string[];
}>;
type FileRedir = {
  kind: "write" | "read" | "herestring";
  op: string;
  append: boolean;
  target: Part[] | null;
};
type HereDoc = { delim: string; expand: boolean; strip: boolean; body: string | null };
type Op = ";" | "&&" | "||" | "|";
type Tok =
  | { t: "word"; parts: Part[] }
  | { t: "op"; op: Op; nl?: boolean }
  | { t: "redir"; text: string }
  | { t: "file"; r: FileRedir }
  | { t: "heredoc"; r: HereDoc }
  | { t: "open" }
  | { t: "close" };

const refuse = (code: string, detail?: string): CompoundParse => ({
  ok: false,
  code,
  ...(detail !== undefined ? { detail } : {}),
});

class Refusal extends Error {
  constructor(
    readonly code: string,
    readonly detail?: string,
  ) {
    super(code);
  }
}

// Redirections that change nothing: a descriptor duplicated onto another, or /dev/null.
// The console counts as no file: /dev/stdout, /dev/stderr, /dev/fd/1 and /dev/fd/2
// are the command's own output streams (a `>` there is a `>&1` / `>&2`), which
// the host captures. /dev/tty is not: it reaches the person's terminal past the
// host (escape sequences included), decided as a file. Other descriptors
// (/dev/fd/3, /proc/self/fd/N) are whatever the shell holds open there: files.
const HARMLESS_REDIRECT =
  /^(?:(?:\d?>>?|&>>?|\d?>\|)\s*\/dev\/(?:null|stdout|stderr|fd\/[12])|\d?>&\d|\d?<\s*\/dev\/null)(?=$|[\s;&|)])/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const HEREDOC_CAT =
  /^\$\(\s*cat\s*<<(-?)[ \t]*(?:'([A-Za-z0-9_]+)'|"([A-Za-z0-9_]+)"|([A-Za-z0-9_]+))[ \t]*\n/;

/** A here-document's body starting at text[from]: [body, index after the delimiter line]. */
function readHereDoc(text: string, from: number, doc: HereDoc): [string, number] {
  let pos = from;
  let body = "";
  while (pos <= text.length) {
    const eol = text.indexOf("\n", pos);
    const line = text.slice(pos, eol < 0 ? text.length : eol);
    const cmp = doc.strip ? line.replace(/^\t+/, "") : line;
    if (cmp === doc.delim) {
      if (doc.expand && /[$`\\]/.test(body)) {
        throw new Refusal("shell-expansion", "a here-document with expansions");
      }
      return [body, eol < 0 ? text.length : eol + 1];
    }
    if (eol < 0) {
      break;
    }
    body += `${cmp}\n`;
    pos = eol + 1;
  }
  // Ended by the end of input: bash runs it on what is there; the kit does not guess.
  throw new Refusal("redirect", "a here-document with no end");
}

/** The `$...` at text[j]: one part and the length it takes. */
function dollar(text: string, j: number, quoted: boolean): [Part, number] {
  const rest = text.slice(j);
  if (rest.startsWith("$((")) {
    throw new Refusal("shell-expansion", "$((");
  }
  const hd = HEREDOC_CAT.exec(rest);
  if (hd) {
    const doc: HereDoc = {
      delim: hd[2] ?? hd[3] ?? hd[4],
      expand: hd[4] !== undefined,
      strip: hd[1] === "-",
      body: null,
    };
    const [body, after] = readHereDoc(rest, hd[0].length, doc);
    const close = /^\s*\)/.exec(rest.slice(after));
    // Unquoted, the text would be split into words and globbed: refused, not guessed.
    if (!close || !quoted) {
      throw new Refusal("shell-expansion", "$(cat <<...)");
    }
    // $(...) drops the trailing newlines.
    return [{ s: body.replace(/\n+$/, ""), quoted: true }, after + close[0].length];
  }
  if (rest.startsWith("$(")) {
    let depth = 1;
    let k = 2;
    while (k < rest.length && depth > 0) {
      const c = rest[k];
      if (c === "'") {
        const e = rest.indexOf("'", k + 1);
        if (e < 0) {
          throw new Refusal("unbalanced-quote");
        }
        k = e + 1;
        continue;
      }
      if (c === '"') {
        k++;
        while (k < rest.length && rest[k] !== '"') {
          if (rest[k] === "`" || rest.startsWith("$(", k)) {
            throw new Refusal("shell-expansion", "nested substitution");
          }
          k += rest[k] === "\\" ? 2 : 1;
        }
        if (k >= rest.length) {
          throw new Refusal("unbalanced-quote");
        }
        k++;
        continue;
      }
      if (c === "\\") {
        k += 2;
        continue;
      }
      if (c === "`" || rest.startsWith("<<", k) || rest.startsWith("$(", k)) {
        throw new Refusal("shell-expansion", "nested substitution or here-document");
      }
      if (c === "(") {
        depth++;
      } else if (c === ")") {
        depth--;
      }
      k++;
    }
    if (depth !== 0) {
      throw new Refusal("unbalanced-quote", "$(");
    }
    const inner = rest.slice(2, k - 1);
    // $(pwd) is the directory, as $PWD.
    if (/^\s*pwd(?:\s+-L)?\s*$/.test(inner)) {
      return [{ s: "", quoted, variable: "PWD", split: !quoted }, k];
    }
    return [{ s: "", quoted, unknown: true, sub: inner }, k];
  }
  if (rest.startsWith("$?")) {
    return [{ s: "", quoted, unknown: true }, 2];
  }
  // A `$` that starts no expansion is a literal (`grep "x$"`, `echo $ 1`); $'...', $"...",
  // $[...] and the special parameters are refused.
  const after = rest[1];
  if (
    after === undefined ||
    (!/[A-Za-z0-9_{([#@*!$'"-]/.test(after) && !(quoted && after === '"'))
  ) {
    return [{ s: "$", quoted }, 1];
  }
  if (quoted && (after === '"' || after === "'")) {
    return [{ s: "$", quoted }, 1];
  }
  // $0..$9: a positional parameter (known only where a script's arguments are, find -exec sh -c).
  const pos = /^\$(?:\{([0-9])\}|([0-9]))/.exec(rest);
  if (pos) {
    return [{ s: "", quoted, variable: pos[1] ?? pos[2], split: !quoted }, pos[0].length];
  }
  // ${NAME:-WORD} / ${NAME-WORD} with a literal WORD (no expansion, quote or brace in it).
  const d = /^\$\{([A-Za-z_][A-Za-z0-9_]*)(:?)-([^}$`\\"'{]*)\}/.exec(rest);
  if (d) {
    return [
      { s: "", quoted, variable: d[1], split: !quoted, dflt: { word: d[3], colon: d[2] === ":" } },
      d[0].length,
    ];
  }
  const m = /^\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/.exec(rest);
  if (!m) {
    throw new Refusal("shell-expansion", "$");
  }
  return [{ s: "", quoted, variable: m[1] ?? m[2], split: !quoted }, m[0].length];
}

function tokenize(command: string, o: CompoundOptions): Tok[] {
  const toks: Tok[] = [];
  let parts: Part[] = [];
  let target: FileRedir | null = null;
  const docs: HereDoc[] = [];
  const endWord = () => {
    if (parts.length) {
      const braces = parts.filter((p) => p.brace);
      if (braces.length > 1 || (braces.length && target)) {
        throw new Refusal("shell-metacharacter", "{");
      }
      if (target) {
        target.target = parts;
        target = null;
      } else if (braces.length) {
        const b = braces[0];
        for (const alt of b.brace ?? []) {
          toks.push({
            t: "word",
            parts: parts.map((p) => (p === b ? { s: alt, quoted: true } : p)),
          });
        }
      } else {
        toks.push({ t: "word", parts });
      }
    }
    parts = [];
  };
  const boundary = () => {
    endWord();
    if (target) {
      throw new Refusal("redirect", "a redirection with no file");
    }
  };
  let i = 0;
  while (i < command.length) {
    const c = command[i];
    if (c === " " || c === "\t") {
      endWord();
      i++;
      continue;
    }
    if (c === "\n") {
      boundary();
      toks.push({ t: "op", op: ";", nl: true });
      i++;
      // The here-documents of this line: their bodies come next.
      while (docs.length) {
        const doc = docs.shift() as HereDoc;
        const [body, after] = readHereDoc(command, i, doc);
        doc.body = body;
        i = after;
      }
      continue;
    }
    if (c === ";") {
      boundary();
      toks.push({ t: "op", op: ";" });
      i++;
      continue;
    }
    if (c === "&" && command[i + 1] === "&") {
      boundary();
      toks.push({ t: "op", op: "&&" });
      i += 2;
      continue;
    }
    if (c === "|" && command[i + 1] === "|") {
      boundary();
      toks.push({ t: "op", op: "||" });
      i += 2;
      continue;
    }
    if (c === "|") {
      if (command[i + 1] === "&") {
        throw new Refusal("shell-metacharacter", "|&");
      }
      boundary();
      toks.push({ t: "op", op: "|" });
      i++;
      continue;
    }
    // A redirection: at the start of a word (a descriptor number may begin it).
    if (
      c === ">" ||
      c === "<" ||
      (c === "&" && command[i + 1] === ">") ||
      (/\d/.test(c) && /^\d[<>]/.test(command.slice(i, i + 2)) && parts.length === 0)
    ) {
      if (parts.length || target) {
        throw new Refusal("shell-metacharacter", c);
      }
      const rest = command.slice(i);
      const m = HARMLESS_REDIRECT.exec(rest);
      if (m) {
        toks.push({ t: "redir", text: m[0] });
        i += m[0].length;
        continue;
      }
      // A here-string (`<<< WORD`): WORD and a newline are the command's input, as a here-document's body.
      const hs = o.fileRedirects ? /^0?<<<[ \t]*/.exec(rest) : null;
      if (hs) {
        target = { kind: "herestring", op: "<<<", append: false, target: null };
        toks.push({ t: "file", r: target });
        i += hs[0].length;
        continue;
      }
      if (!o.fileRedirects || /^\d?[<>]\(|^\d?<<<|^\d?<>|^\d?>&|^&>&/.test(rest)) {
        throw new Refusal("redirect", command.slice(i, i + 40));
      }
      const hd =
        /^0?<<(-?)[ \t]*(?:'([A-Za-z0-9_.-]+)'|"([A-Za-z0-9_.-]+)"|([A-Za-z0-9_.-]+))/.exec(rest);
      if (hd) {
        const doc: HereDoc = {
          delim: hd[2] ?? hd[3] ?? hd[4],
          expand: hd[4] !== undefined,
          strip: hd[1] === "-",
          body: null,
        };
        docs.push(doc);
        toks.push({ t: "heredoc", r: doc });
        i += hd[0].length;
        continue;
      }
      const w = /^(?:[12]?|&)(>>|>\||>)[ \t]*/.exec(rest);
      const r = /^0?<[ \t]*/.exec(rest);
      if (w) {
        target = { kind: "write", op: w[0].trim(), append: w[1] === ">>", target: null };
        toks.push({ t: "file", r: target });
        i += w[0].length;
        continue;
      }
      if (r) {
        target = { kind: "read", op: "<", append: false, target: null };
        toks.push({ t: "file", r: target });
        i += r[0].length;
        continue;
      }
      throw new Refusal("redirect", command.slice(i, i + 40));
    }
    if (c === "'") {
      const end = command.indexOf("'", i + 1);
      if (end < 0) {
        throw new Refusal("unbalanced-quote");
      }
      parts.push({ s: command.slice(i + 1, end), quoted: true });
      i = end + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let s = "";
      const flush = () => {
        // An empty "" is still a (empty) word.
        parts.push({ s, quoted: true });
        s = "";
      };
      for (;;) {
        if (j >= command.length) {
          throw new Refusal("unbalanced-quote");
        }
        const d = command[j];
        if (d === '"') {
          break;
        }
        if (d === "\\") {
          const n = command[j + 1];
          if (n === undefined) {
            throw new Refusal("unbalanced-quote");
          }
          if (n !== "\n") {
            s += '$`"\\'.includes(n) ? n : `\\${n}`;
          }
          j += 2;
          continue;
        }
        if (d === "$") {
          const [p, len] = dollar(command, j, true);
          flush();
          parts.push(p);
          j += len;
          continue;
        }
        if (d === "`") {
          throw new Refusal("shell-expansion", d);
        }
        s += d;
        j++;
      }
      flush();
      i = j + 1;
      continue;
    }
    if (c === "\\") {
      const n = command[i + 1];
      if (n === undefined) {
        throw new Refusal("shell-metacharacter", "\\");
      }
      if (n !== "\n") {
        parts.push({ s: n, quoted: true });
      }
      i += 2;
      continue;
    }
    if (c === "$") {
      const [p, len] = dollar(command, i, false);
      parts.push(p);
      i += len;
      continue;
    }
    // `#` starts a comment only at the start of a word; inside one it is text.
    if (c === "#" && parts.length) {
      parts.push({ s: c, quoted: false });
      i++;
      continue;
    }
    // At the start of a word it starts a comment, to the end of the line.
    if (c === "#" && !target) {
      const eol = command.indexOf("\n", i);
      i = eol < 0 ? command.length : eol;
      continue;
    }
    if (c === "(" && parts.length === 0 && !target) {
      toks.push({ t: "open" });
      i++;
      continue;
    }
    if (c === ")") {
      boundary();
      toks.push({ t: "close" });
      i++;
      continue;
    }
    if (
      c === "{" &&
      ((o.shell === "dash" && /^\{[^\s{}]*(?:,|\.\.)[^\s{}]*\}/.test(command.slice(i, i + 256))) ||
        (o.shell === "bash" && /^\{[^\s{},]*\.\.[^\s{},]*\}/.test(command.slice(i, i + 256))))
    ) {
      throw new Refusal("shell-metacharacter", "{");
    }
    // Brace expansion of plain alternatives (`dir/{a,b}`): one word per alternative.
    const brace =
      c === "{" ? /^\{([A-Za-z0-9_./-]*(?:,[A-Za-z0-9_./-]*)+)\}/.exec(command.slice(i)) : null;
    if (brace) {
      parts.push({ s: "", quoted: false, brace: brace[1].split(",") });
      i += brace[0].length;
      continue;
    }
    // `{}` alone is a word (find -exec's placeholder); no brace expansion or group.
    if (
      c === "{" &&
      command[i + 1] === "}" &&
      parts.length === 0 &&
      /^$|^[\s;&|)]/.test(command.slice(i + 2, i + 3))
    ) {
      parts.push({ s: "{}", quoted: true });
      i += 2;
      continue;
    }
    // `{` and `}` standing alone are words: the reserved words of a brace group
    // in command position (the parser reads `{ LIST; }`), plain text as arguments.
    if (
      (c === "{" || c === "}") &&
      parts.length === 0 &&
      !target &&
      (c === "{" ? /^$|^[ \t\n]/ : /^$|^[\s;&|)]/).test(command.slice(i + 1, i + 2))
    ) {
      toks.push({ t: "word", parts: [{ s: c, quoted: false }] });
      i++;
      continue;
    }
    // The host's shell is not interactive: no history expansion, `!` is a literal
    // (a `!` in command position, pipeline negation, is refused by the parser).
    if (c === "!") {
      parts.push({ s: c, quoted: false });
      i++;
      continue;
    }
    if ("`()&{}#<>\r".includes(c)) {
      throw new Refusal("shell-metacharacter", c);
    }
    parts.push({ s: c, quoted: false });
    i++;
  }
  endWord();
  if (target) {
    throw new Refusal("redirect", "a redirection with no file");
  }
  if (docs.length) {
    throw new Refusal("redirect", "a here-document with no end");
  }
  return toks;
}

type Scope = {
  cwd: string;
  cwds: string[];
  bindings: Map<string, string | Fileset>;
  /** Variables set where it may not happen, or once per pass of a loop: their value after is not known. */
  tainted?: Set<string>;
};

/** The word's text: variables resolved; `~` and `~/...` at the start of an unquoted word as the home directory. */
function wordText(parts: readonly Part[], ctx: ShellContext, scope: Scope): string {
  let out = "";
  for (const p of parts) {
    if (p.dflt) {
      throw new Refusal("shell-expansion", `\${${p.variable ?? ""}-...}`);
    }
    if (p.unknown) {
      throw new Refusal("shell-expansion", p.sub !== undefined ? "$(...)" : "$?");
    }
    if (!p.variable) {
      out += p.s;
      continue;
    }
    let v: string | null;
    if (scope.tainted?.has(p.variable)) {
      throw new Refusal("shell-expansion", `$${p.variable} (set where it may not run)`);
    }
    if (scope.bindings.has(p.variable)) {
      const b = scope.bindings.get(p.variable);
      if (typeof b !== "string") {
        throw new Refusal("shell-expansion", `$${p.variable}`);
      }
      v = b;
    } else if (p.variable === "PWD") {
      // $PWD is known only while the directory is (no earlier `cd` that may have failed).
      if (scope.cwds.length !== 1) {
        throw new Refusal("shell-expansion", "$PWD after a cd that may fail");
      }
      v = scope.cwds[0];
    } else if (p.variable === "HOME") {
      v = ctx.home;
    } else {
      v = envValue(ctx, p.variable);
      if (v === null) {
        throw new Refusal("shell-expansion", `$${p.variable}`);
      }
    }
    if (v === null) {
      throw new Refusal("shell-expansion", `$${p.variable}`);
    }
    // Unquoted, the shell splits the value on blanks and expands globs in it: refused, not guessed.
    if (p.split && /[\s*?[\]]/.test(v)) {
      throw new Refusal("shell-expansion", `$${p.variable}`);
    }
    out += v;
  }
  const tilde = parts[0] && !parts[0].quoted && !parts[0].variable && parts[0].s === "~";
  if (tilde) {
    const next = parts[1];
    if (!next || (!next.quoted && !next.variable && next.s === "/")) {
      if (!ctx.home) {
        throw new Refusal("shell-expansion", "~");
      }
      return ctx.home + out.slice(1);
    }
    if (next && !next.quoted && !next.variable) {
      throw new Refusal("shell-expansion", "~user");
    }
  }
  return out;
}

type WordInfo = { text: string; unknown: boolean; fileset: Fileset | null };

/**
 * A word whose value may be partly unknown: `$?`, `$(...)`, an environment
 * variable that is not credential-shaped (printing it is what `printenv NAME`
 * does), or a file name from a listed set. Unknown parts read as "".
 */
function wordInfo(parts: readonly Part[], ctx: ShellContext, scope: Scope): WordInfo {
  if (parts.some((p) => p.dflt)) {
    throw new Refusal("shell-expansion", "${...-...}");
  }
  const bound = (p: Part) => (p.variable ? scope.bindings.get(p.variable) : undefined);
  const isSet = (p: Part) =>
    Boolean(p.fileset) || (bound(p) !== undefined && typeof bound(p) !== "string");
  const env = (p: Part) =>
    p.variable !== undefined &&
    (!scope.bindings.has(p.variable) || Boolean(scope.tainted?.has(p.variable))) &&
    p.variable !== "HOME" &&
    p.variable !== "PWD" &&
    !/^[0-9]$/.test(p.variable) &&
    envValue(ctx, p.variable) === null;
  if (!parts.some((p) => p.unknown || isSet(p) || env(p))) {
    return { text: wordText(parts, ctx, scope), unknown: false, fileset: null };
  }
  let text = "";
  for (const p of parts) {
    if (p.brace) {
      throw new Refusal("shell-metacharacter", "{");
    }
    if (env(p) && credentialLike(p.variable as string)) {
      throw new Refusal("shell-expansion", `$${p.variable}`);
    }
    text += p.unknown || isSet(p) || env(p) ? "" : p.variable ? wordText([p], ctx, scope) : p.s;
  }
  // A file name from a set only when it is the whole word ("$f": empty quoted text around it).
  const solid = parts.filter((p) => !(p.s === "" && !p.variable && !p.unknown));
  const only = solid.length === 1 ? solid[0] : null;
  const fileset = only?.fileset ?? (only && isSet(only) ? (bound(only) as Fileset) : null);
  return { text, unknown: true, fileset };
}

// Commands whose arguments are files they read (or a pattern): a name from a listed set may be one.
const FILE_READERS = new Set(["cat", "head", "tail", "wc", "grep", "ls", "stat", "file", "du"]);

/** `grep -l/-L [-r] PATTERN PATHS`: the names of files under PATHS (null: not that shape). */
function grepListRoots(args: readonly string[]): { paths: string[]; include: string[] } | null {
  const include: string[] = [];
  let lists = false;
  let recursive = false;
  let pattern = false;
  const pos: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") {
      pos.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      if (a.startsWith("--include=")) {
        include.push(a.slice("--include=".length));
        continue;
      }
      if (/^--(?:exclude|exclude-dir)=/.test(a)) {
        continue;
      }
      if (a === "--files-with-matches" || a === "--files-without-match") {
        lists = true;
      } else if (a === "--recursive") {
        recursive = true;
      } else if (
        ![
          "--ignore-case",
          "--extended-regexp",
          "--fixed-strings",
          "--word-regexp",
          "--invert-match",
        ].includes(a)
      ) {
        return null;
      }
      continue;
    }
    if (a.startsWith("-") && a.length > 1) {
      const m = /^-([lLriEFwvIsx]*)(e?)$/.exec(a);
      if (!m) {
        return null;
      }
      lists ||= /[lL]/.test(m[1]);
      recursive ||= m[1].includes("r");
      if (m[2]) {
        if (i + 1 >= args.length) {
          return null;
        }
        pattern = true;
        i++;
      }
      continue;
    }
    pos.push(a);
  }
  if (!lists) {
    return null;
  }
  const paths = pattern ? pos : pos.slice(1);
  if (!pattern && pos.length === 0) {
    return null;
  }
  if (paths.length === 0) {
    return recursive ? { paths: ["."], include } : null;
  }
  return paths.some((p) => /[*?[]/.test(p)) ? null : { paths, include };
}
// The filters a listing may pass through: they only drop or reorder names.
const NAME_FILTERS = new Set(["grep", "head", "tail", "sort", "uniq"]);
const FIND_REFUSED = new Set([
  "-L",
  "-H",
  "-follow",
  "-exec",
  "-execdir",
  "-ok",
  "-okdir",
  "-printf",
  "-fprintf",
  "-fprint",
  "-fprint0",
  "-print0",
  "-ls",
  "-fls",
  "-delete",
]);

/** A filter of a listing's names that prints only (a subset of) the names it reads, one per line. */
function nameFilter(argv: readonly string[]): boolean {
  const [prog, ...args] = argv;
  if (!NAME_FILTERS.has(prog)) {
    return false;
  }
  if (prog === "grep") {
    let patterns = 0;
    let e = false;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === "-e") {
        e = true;
        i++;
      } else if (/^-[viEFxwG]+$/.test(a)) {
        continue;
      } else if (a.startsWith("-")) {
        return false;
      } else {
        patterns++;
      }
    }
    // No file operand: it reads the listing.
    return e ? patterns === 0 : patterns === 1;
  }
  if (prog === "head" || prog === "tail") {
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "-n" && /^\d+$/.test(args[i + 1] ?? "")) {
        i++;
      } else if (!/^-(?:n)?\d+$/.test(args[i])) {
        return false;
      }
    }
    return true;
  }
  if (prog === "sort") {
    return args.every((a) => /^-[rufnV]+$/.test(a));
  }
  return args.length === 0;
}

/** The set of files a substitution's commands list, or null when it is not a listing the kit reads. */
function filesetOf(cmds: readonly SimpleCommand[]): Fileset | null {
  const [first, ...rest] = cmds;
  if (!first || first.assigns.length) {
    return null;
  }
  const bases = first.cwds;
  const under = (rels: readonly string[]) =>
    bases.flatMap((b) => rels.map((r) => path.resolve(b, r)));
  let roots: string[];
  let source: Fileset["source"];
  let findSpec: Fileset["find"];
  let include: string[] | undefined;
  if (first.argv[0] === "git" && first.argv[1] === "ls-files") {
    const args = first.argv.slice(2).filter((a) => a !== "--");
    if (args.some((a) => (a.startsWith("-") ? a !== "--cached" && a !== "-c" : /[*?[:]/.test(a)))) {
      return null;
    }
    const specs = args.filter((a) => !a.startsWith("-"));
    roots = under(specs.length ? specs : ["."]);
    source = "git ls-files";
  } else if (first.argv[0] === "find") {
    const args = first.argv.slice(1);
    if (args.some((a) => FIND_REFUSED.has(a))) {
      return null;
    }
    const starts: string[] = [];
    for (const a of args) {
      if (a.startsWith("-") || ["!", "(", ")", ","].includes(a)) {
        break;
      }
      starts.push(a);
    }
    if (starts.some((a) => /[*?[]/.test(a))) {
      return null;
    }
    roots = under(starts.length ? starts : ["."]);
    source = "find";
    findSpec = { starts: starts.length ? starts : ["."], expr: args.slice(starts.length) };
  } else if (first.argv[0] === "grep") {
    const g = grepListRoots(first.argv.slice(1));
    if (!g) {
      return null;
    }
    roots = under(g.paths);
    source = "grep -l";
    include = g.include.length ? g.include : undefined;
  } else {
    return null;
  }
  for (const c of rest) {
    if (!c.piped || c.assigns.length || !nameFilter(c.argv)) {
      return null;
    }
  }
  return {
    roots: [...new Set(roots)],
    source,
    bases,
    ...(include ? { include } : {}),
    ...(findSpec ? { find: findSpec } : {}),
  };
}

const ASSIGN = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s;
// Commands that only print or compare an argument: one whose value is unknown changes no effect.
const TAKES_UNKNOWN = new Set(["echo", "printf", "test", "["]);

// Variables the shell itself reads (bash and zsh, zsh's tied lower-case arrays
// included): assigning one changes how the line is read or what it runs, even
// unexported.
const SHELL_SPECIAL = new Set(
  "PATH IFS CDPATH HOME PWD OLDPWD ENV BASH_ENV PS1 PS2 PS3 PS4 PROMPT_COMMAND PROMPT_COMMANDS SHELLOPTS BASHOPTS GLOBIGNORE FIGNORE EXECIGNORE HISTFILE HISTCONTROL HISTIGNORE HISTSIZE HISTFILESIZE HISTTIMEFORMAT HOSTFILE INPUTRC MAIL MAILPATH MAILCHECK OPTIND OPTARG OPTERR REPLY TMOUT TIMEFORMAT FUNCNEST POSIXLY_CORRECT SHELL TERM TERMINFO TMPDIR LANG LANGUAGE NLSPATH COLUMNS LINES FPATH MANPATH MODULE_PATH ZDOTDIR KEYTIMEOUT WORDCHARS PROMPT RPROMPT PROMPT2 PROMPT3 PROMPT4 READNULLCMD NULLCMD PAGER EDITOR VISUAL BROWSER CC CXX CFLAGS CXXFLAGS LDFLAGS MAKEFLAGS path cdpath fpath manpath module_path mailpath fignore psvar watch histchars auto_resume http_proxy https_proxy all_proxy no_proxy ftp_proxy".split(
    " ",
  ),
);
// Families that change what programs run or load.
const BEHAVIOR_NAME =
  /^(?:LD_|DYLD_|GIT_|GH_|NODE_|NPM_|PYTHON|PERL|RUBY|BASH_|ZSH_|LC_|SSH_|GPG_|DOCKER_|KUBE|AWS_|CARGO_|RUST|GO[A-Z]|JAVA_|MAVEN_|GRADLE_|CMAKE_|PKG_CONFIG|COMP_|HIST)|_(?:COMMAND|COMMANDS|PROGRAM|OPTIONS|OPTS|FLAGS|PATH|HOOK|SHELL|EDITOR|PAGER|PROXY)$/;

// Exported, a name reaches every program the line runs after it: also refused are
// the variables the C library, the loader, locale and pagers read, and names of
// the shape programs use for their configuration (a file, a directory, arguments).
const EXPORT_BEHAVIOR =
  /^(?:GCONV_PATH|GLIBC_TUNABLES|MALLOC_\w*|LOCPATH|NLSPATH|HOSTALIASES|RES_OPTIONS|LOCALDOMAIN|TZDIR|LESS\w*|MAN\w*|GREP_\w*|TAR_\w*|XZ_\w*|ZSTD_\w*|GZIP|BZIP2?|SSL_\w*|OPENSSL_\w*|CURL_\w*|WGETRC|JQ_\w*|TERM\w*|DISPLAY|WAYLAND_\w*|DBUS_\w*|XDG_\w*|SUDO_\w*|OMP_\w*|PERL\w*|LUA_\w*|TCL\w*|R_\w*|JULIA_\w*|\w*(?:_CONFIG|_HOME|_DIR|_RC|_FILE|_LIBRARY|_ARGS|_PLUGINS|_PRELOAD|_ROOT|RC))$/;

/** A name `export NAME=VALUE` may set: one the line may set, and none programs read for their behavior. */
function exportedName(name: string): boolean {
  return shellOwnName(name) && !EXPORT_BEHAVIOR.test(name);
}

/**
 * A name `NAME=VALUE` alone may set as the line's own shell variable: not one
 * the shell reads itself, not one of a family that changes what programs run,
 * and (checked by the caller) not already exported by the session.
 */
function shellOwnName(name: string): boolean {
  return (
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !SHELL_SPECIAL.has(name) && !BEHAVIOR_NAME.test(name)
  );
}
// Reserved words of compound commands the kit does not read.
const RESERVED = new Set([
  "if",
  "then",
  "elif",
  "else",
  "fi",
  "while",
  "until",
  "case",
  "esac",
  "select",
  "function",
  "do",
  "done",
  "in",
  "!",
  "[[",
  "]]",
  "{",
  "}",
  "time",
  "coproc",
]);

// Builtins that set or unset shell variables or the positional parameters.
const VARIABLE_SETTERS = new Set(
  "read readarray mapfile export unset declare typeset local readonly getopts let eval source . set shift exec alias unalias enable builtin command trap".split(
    " ",
  ),
);

/** A word that is exactly `w`, unquoted (a reserved word only counts unquoted). */
// Words that end a compound command's part.
const BODY_END = ["done", "then", "elif", "else", "fi"];

const isWord = (t: Tok | undefined, w: string): boolean =>
  t?.t === "word" &&
  t.parts.every((p) => !p.quoted && !p.variable && !p.unknown) &&
  t.parts.map((p) => p.s).join("") === w;

class Parser {
  pos = 0;
  /** What every command parsed now requires (from the && chain around the current compound). */
  inherited: number[] = [];
  /** The && chain before the current item. */
  chain: number[] = [];
  /** Commands whose failure ends the shell (`X || exit`, set -e), for everything after them. */
  fatal: number[] = [];
  /** set -e is on. */
  errexit = false;
  /** Inside a subshell (an exit ends only it), or a condition (set -e does not apply). */
  noExit = 0;
  inCond = 0;
  /** Inside a part that may not run at all (an if branch, a while body): nothing there is required later. */
  maybeSkipped = 0;
  /** Inside a for loop's body. */
  loopDepth = 0;
  /** How many variable assignments were read (a loop that makes one is not read). */
  assignments = 0;
  /** Names the line sets with NAME=VALUE (shared with nested parsers). */
  assignedNames = new Set<string>();
  constructor(
    readonly toks: readonly Tok[],
    readonly ctx: ShellContext,
    readonly o: CompoundOptions,
    readonly out: SimpleCommand[],
    readonly depth: number,
  ) {}

  /** Add a command with what it requires to run. */
  emit(c: SimpleCommand): void {
    const req = [...new Set([...this.inherited, ...this.chain, ...this.fatal])].toSorted(
      (a, b) => a - b,
    );
    this.out.push(req.length ? { ...c, requires: req } : c);
  }

  /** A list up to `stop` (")" or one of the reserved words, consumed and returned) or the end. */
  list(scope: Scope, stop: "close" | readonly string[] | null): string | null {
    const stopWord = (t: Tok | undefined) =>
      Array.isArray(stop) ? stop.find((w) => isWord(t, w)) : undefined;
    // Where the current pipeline's commands start in `out`.
    let pipeStart = this.out.length;
    let piped = false;
    // The && chain of the current item: what it requires from the commands before it in this list.
    let chain: number[] = [];
    const savedChain = this.chain;
    const savedInherited = this.inherited;
    // The command whose failure ends the shell after the next item (`X || exit`).
    let pendingFatal: number | null = null;
    let orSeen = false;
    for (;;) {
      let t = this.toks[this.pos];
      // Blank lines between items.
      if (!piped) {
        while (t?.t === "op" && t.nl) {
          t = this.toks[++this.pos];
        }
      }
      if (!t) {
        if (stop) {
          throw new Refusal("no-command", stop === "close" ? "(" : stop.join("/"));
        }
        return null;
      }
      if (stop === "close" && t.t === "close") {
        this.pos++;
        return ")";
      }
      const sw = stopWord(t);
      if (sw) {
        this.pos++;
        return sw;
      }
      // `time [-p] PIPELINE` (the reserved word, at a pipeline's start): the
      // pipeline runs as written, its times printed to standard error.
      if (!piped) {
        while (isWord(t, "time")) {
          this.pos++;
          if (isWord(this.toks[this.pos], "-p")) {
            this.pos++;
          }
          t = this.toks[this.pos];
          if (!t || (t.t !== "word" && t.t !== "open") || stopWord(t) !== undefined) {
            throw new Refusal("no-command", "time");
          }
        }
      }
      const first = this.out.length;
      if (!piped) {
        pipeStart = first;
      }
      this.chain = chain;
      // A compound's own commands require what the compound required.
      this.inherited = [...savedInherited, ...chain];
      const simpleItem =
        t.t !== "open" && !["while", "until", "for", "if", "{"].some((w) => isWord(t, w));
      if (isWord(t, "{")) {
        if (piped) {
          throw new Refusal("shell-metacharacter", "a brace group in a pipeline");
        }
        this.pos++;
        this.braceGroup(scope);
        this.trailing();
      } else if (t.t === "open") {
        if (piped) {
          throw new Refusal("shell-metacharacter", "a subshell in a pipeline");
        }
        this.pos++;
        // A subshell: its `cd` does not reach the commands after it, nor its exit.
        this.noExit++;
        const fatal = this.fatal;
        const errexit = this.errexit;
        try {
          this.list(
            {
              cwd: scope.cwd,
              cwds: [...scope.cwds],
              bindings: new Map(scope.bindings),
              tainted: scope.tainted,
            },
            "close",
          );
        } finally {
          this.noExit--;
          this.fatal = fatal;
          this.errexit = errexit;
        }
        this.trailing();
      } else if ((isWord(t, "while") || isWord(t, "until")) && !piped) {
        this.conditionLoop(scope);
        this.trailing();
      } else if (isWord(t, "while")) {
        // `LISTING | while read NAME; do …; done`: NAME is each name of the listing.
        const set = piped ? filesetOf(this.out.slice(pipeStart)) : null;
        if (!set) {
          throw new Refusal("shell-metacharacter", "while");
        }
        this.whileRead(scope, set);
        this.trailing();
      } else if (isWord(t, "for")) {
        if (piped) {
          throw new Refusal("shell-metacharacter", "a loop in a pipeline");
        }
        this.forLoop(scope);
        this.trailing();
      } else if (isWord(t, "if")) {
        if (piped) {
          throw new Refusal("shell-metacharacter", "an if in a pipeline");
        }
        this.ifClause(scope);
        this.trailing();
      } else {
        this.simple(scope, piped);
      }
      this.chain = savedChain;
      this.inherited = savedInherited;
      if (this.out.length === first) {
        throw new Refusal("no-command");
      }
      const main = this.out.length - 1;
      const n = this.toks[this.pos];
      const op = n?.t === "op" ? n.op : null;
      if (pendingFatal !== null) {
        // The `exit` after `X ||` has been read: X's failure ends the shell.
        this.fatal = [...this.fatal, pendingFatal];
        pendingFatal = null;
      }
      if (simpleItem && this.noExit === 0 && this.maybeSkipped === 0) {
        const argv = this.out[main].argv;
        // `X || exit [N]`: X's failure ends the shell; not when X is a pipeline's first parts.
        if (op === "||" && isWord(this.toks[this.pos + 1], "exit")) {
          pendingFatal = main;
        } else if (this.errexit && this.inCond === 0 && op !== "&&" && op !== "||" && op !== "|") {
          // set -e: a plain command not left in an && / || list, not in a condition.
          this.fatal = [...this.fatal, main];
        }
        if (
          argv[0] === "set" &&
          argv.slice(1).some((a) => /^-[a-z]*e/.test(a) || a === "errexit")
        ) {
          this.errexit = this.inCond === 0;
        }
      }
      // After a `||` the rest of this and-or list may run whichever side succeeded: it requires nothing from it.
      if (op === "||") {
        orSeen = true;
      } else if (op !== "&&" && op !== "|") {
        orSeen = false;
      }
      chain = orSeen
        ? []
        : op === "&&"
          ? [...chain, ...(simpleItem ? [main] : [])]
          : op === "|"
            ? chain
            : [];
      if (!n || (stop === "close" && n.t === "close") || stopWord(n)) {
        continue;
      }
      if (n.t !== "op") {
        throw new Refusal("shell-metacharacter", "(");
      }
      this.pos++;
      const last = this.out.length - 1;
      this.out[last] = { ...this.out[last], next: n.op };
      piped = n.op === "|";
      if (n.op !== ";") {
        // A line break may follow `&&`, `||` or `|`; the list goes on after it.
        while (this.toks[this.pos]?.t === "op" && (this.toks[this.pos] as { nl?: boolean }).nl) {
          this.pos++;
        }
        const after = this.toks[this.pos];
        if (!after || after.t === "op" || after.t === "close" || stopWord(after)) {
          throw new Refusal("no-command");
        }
      } else if (!n.nl) {
        const after = this.toks[this.pos];
        if (after?.t === "op" && !after.nl) {
          throw new Refusal("no-command");
        }
      }
    }
  }

  /**
   * `{ LIST; }`, a brace group: LIST runs in this shell, so its `cd` and its
   * assignments reach the commands after it, unless the group is a part of a
   * pipeline (a subshell there). Its exit and set -e are read as a subshell's
   * (nothing after it is counted as requiring them: never fewer commands run).
   */
  braceGroup(scope: Scope): void {
    const inner: Scope = {
      cwd: scope.cwd,
      cwds: [...scope.cwds],
      bindings: new Map(scope.bindings),
      tainted: scope.tainted ? new Set(scope.tainted) : undefined,
    };
    this.noExit++;
    const fatal = this.fatal;
    const errexit = this.errexit;
    try {
      this.list(inner, ["}"]);
    } finally {
      this.noExit--;
      this.fatal = fatal;
      this.errexit = errexit;
    }
    let k = this.pos;
    while (this.toks[k]?.t === "redir") {
      k++;
    }
    const n = this.toks[k];
    if (n?.t === "op" && n.op === "|") {
      return;
    }
    scope.cwd = inner.cwd;
    scope.cwds = inner.cwds;
    scope.bindings = inner.bindings;
    if (inner.tainted) {
      scope.tainted = inner.tainted;
    }
  }

  /** After `)` or `done`: only redirections that change nothing. */
  trailing(): void {
    while (this.toks[this.pos]?.t === "redir") {
      this.pos++;
    }
    const t = this.toks[this.pos];
    if (t && t.t !== "op" && t.t !== "close" && !BODY_END.some((w) => isWord(t, w))) {
      throw new Refusal("shell-metacharacter", "after a compound command");
    }
  }

  /**
   * `if LIST; then LIST; [elif LIST; then LIST;]... [else LIST;] fi`: every
   * condition and every branch may run, so all are returned (each rule decides
   * each of them); a `cd` in any of them may or may not have happened after it.
   */
  ifClause(scope: Scope): void {
    this.pos++;
    // The parts run in order, each possibly not at all: every directory any
    // of them may leave the shell in is kept for what comes after.
    const seen = new Set(scope.cwds);
    const part = (stops: readonly string[]) => {
      const end = this.list(scope, stops) as string;
      for (const d of scope.cwds) {
        seen.add(d);
      }
      scope.cwds = [...seen];
      if (scope.cwds.length > 8) {
        throw new Refusal("argument-not-read-only", "too many cd");
      }
      return end;
    };
    // The first condition always runs (set -e does not apply in it); every other part may not run.
    const cond = (stops: readonly string[]) => {
      this.inCond++;
      try {
        return part(stops);
      } finally {
        this.inCond--;
      }
    };
    cond(["then"]);
    this.maybeSkipped++;
    try {
      for (;;) {
        const end = part(["elif", "else", "fi"]);
        if (end === "fi") {
          return;
        }
        if (end === "elif") {
          cond(["then"]);
          continue;
        }
        part(["fi"]);
        return;
      }
    } finally {
      this.maybeSkipped--;
    }
  }

  /** `while read [-r] NAME; do BODY; done`, its input a listing: BODY once, NAME bound to the listing's names. */
  whileRead(scope: Scope, set: Fileset): void {
    this.pos++;
    if (!isWord(this.toks[this.pos], "read")) {
      throw new Refusal("shell-metacharacter", "while");
    }
    this.pos++;
    if (isWord(this.toks[this.pos], "-r")) {
      this.pos++;
    }
    const nameTok = this.toks[this.pos++];
    const name =
      nameTok?.t === "word" && nameTok.parts.every((p) => !p.quoted && !p.variable && !p.unknown)
        ? nameTok.parts.map((p) => p.s).join("")
        : "";
    const sep = this.toks[this.pos];
    if (!NAME.test(name) || sep?.t !== "op" || sep.op !== ";") {
      throw new Refusal("shell-metacharacter", "while");
    }
    while (this.toks[this.pos]?.t === "op" && (this.toks[this.pos] as { op: Op }).op === ";") {
      this.pos++;
    }
    if (!isWord(this.toks[this.pos], "do")) {
      throw new Refusal("shell-metacharacter", "while without do");
    }
    this.pos++;
    const had = scope.bindings;
    scope.bindings = new Map(had).set(name, set);
    // The body runs once per name, maybe not at all.
    this.maybeSkipped++;
    try {
      this.list(scope, ["done"]);
    } finally {
      scope.bindings = had;
      this.maybeSkipped--;
    }
  }

  /**
   * `while LIST; do LIST; done` and `until LIST; do LIST; done`: the
   * condition runs at least once, the body any number of times, each part
   * again after the other; every command of both is returned (each rule
   * decides each of them). A variable set there has no one value after it
   * (read as a loop's); a `cd` there would leave the shell in a directory
   * that depends on how often it ran: refused.
   */
  conditionLoop(scope: Scope): void {
    this.pos++;
    const first = this.out.length;
    const assignedBefore = this.assignments;
    this.loopDepth++;
    try {
      this.inCond++;
      try {
        this.list(scope, ["do"]);
      } finally {
        this.inCond--;
      }
      this.maybeSkipped++;
      try {
        this.list(scope, ["done"]);
      } finally {
        this.maybeSkipped--;
      }
    } finally {
      this.loopDepth--;
    }
    if (this.out.slice(first).some((c) => c.argv[0] === "cd")) {
      throw new Refusal("shell-metacharacter", "a cd in a while or until loop");
    }
    // Each part runs again after the other: a variable either sets would hold
    // another value the next time a word reads it than the one read here.
    if (
      this.assignments !== assignedBefore ||
      this.out
        .slice(first)
        .some(
          (c) =>
            VARIABLE_SETTERS.has(c.argv[0] ?? "") ||
            (c.argv[0] === "printf" && c.argv.some((a) => /^-[A-Za-z]*v/.test(a))),
        )
    ) {
      throw new Refusal("shell-expansion", "a variable set in a while or until loop");
    }
  }

  forLoop(scope: Scope): void {
    this.pos++;
    const nameTok = this.toks[this.pos++];
    const name =
      nameTok?.t === "word" && nameTok.parts.every((p) => !p.quoted && !p.variable && !p.unknown)
        ? nameTok.parts.map((p) => p.s).join("")
        : "";
    if (!NAME.test(name) || !isWord(this.toks[this.pos], "in")) {
      throw new Refusal("shell-expansion", "for without a word list");
    }
    this.pos++;
    const values: (string | Fileset)[] = [];
    while (this.toks[this.pos]?.t === "word") {
      const w = this.toks[this.pos++] as Extract<Tok, { t: "word" }>;
      const only = w.parts.length === 1 ? w.parts[0] : null;
      if (only?.sub !== undefined && !only.quoted) {
        // `for f in $(git ls-files ...)`: f is each name of the listing, unknown to the kit.
        const set = this.substitution(only.sub, scope);
        if (!set) {
          throw new Refusal("shell-expansion", "$(...)");
        }
        values.push(set);
        continue;
      }
      values.push(wordText(w.parts, this.ctx, scope));
    }
    const sep = this.toks[this.pos];
    if (sep?.t !== "op" || sep.op !== ";") {
      throw new Refusal("shell-metacharacter", "for");
    }
    while (this.toks[this.pos]?.t === "op" && (this.toks[this.pos] as { op: Op }).op === ";") {
      this.pos++;
    }
    if (!isWord(this.toks[this.pos], "do")) {
      throw new Refusal("shell-metacharacter", "for without do");
    }
    this.pos++;
    const body = this.pos;
    const had = scope.bindings;
    try {
      if (values.length === 0) {
        // The body never runs: read once, to find its end, and drop what it holds.
        const sink = new Parser(this.toks, this.ctx, this.o, [], this.depth);
        sink.assignedNames = this.assignedNames;
        sink.pos = body;
        sink.list(
          {
            cwd: scope.cwd,
            cwds: [...scope.cwds],
            bindings: new Map(had).set(name, ""),
            tainted: scope.tainted,
          },
          ["done"],
        );
        this.pos = sink.pos;
        return;
      }
      for (const v of values) {
        this.pos = body;
        scope.bindings = new Map(had).set(name, v);
        this.loopDepth++;
        try {
          this.list(scope, ["done"]);
        } finally {
          this.loopDepth--;
        }
        if (this.out.length > MAX_COMMANDS) {
          throw new Refusal("command-too-long", "too many commands");
        }
      }
    } finally {
      scope.bindings = had;
    }
  }

  /** find's argv with each `-exec sh -c SCRIPT NAME {} ;` read as SCRIPT's own commands (pushed to out) and dropped. */
  findShellScripts(argv: string[], scope: Scope, found: Fileset): string[] {
    const out: string[] = [];
    for (let i = 0; i < argv.length; i++) {
      const sh = argv[i + 1] ?? "";
      if (argv[i] === "-exec" && ["sh", "bash", "dash"].includes(sh) && argv[i + 2] === "-c") {
        const end = argv.findIndex((x, j) => j > i && (x === ";" || x === "+"));
        const after = argv.slice(i + 4, end);
        // Exactly: -exec sh -c SCRIPT NAME {} ;
        if (
          end < 0 ||
          argv[end] !== ";" ||
          after.length !== 2 ||
          after[1] !== "{}" ||
          this.depth >= MAX_NESTING
        ) {
          throw new Refusal(
            "argument-not-read-only",
            "find -exec sh -c in a form Enclawed does not read",
          );
        }
        const inner = new Parser(
          tokenize(argv[i + 3], this.o),
          this.ctx,
          this.o,
          this.out,
          this.depth + 1,
        );
        inner.inherited = [...this.inherited, ...this.chain, ...this.fatal];
        inner.list(
          {
            cwd: scope.cwd,
            cwds: [...scope.cwds],
            bindings: new Map<string, string | Fileset>([
              ["0", after[0]],
              ["1", found],
            ]),
          },
          null,
        );
        i = end;
        continue;
      }
      out.push(argv[i]);
    }
    return out;
  }

  /** Parse a $(...)'s commands (they run, so they are returned) and the files it lists, if it is a listing. */
  substitution(text: string, scope: Scope): Fileset | null {
    return this.substitute(text, scope).fileset;
  }

  /** A $(...)'s commands (returned, they run), and what the kit knows of its output: a listing, or the exact value. */
  substitute(text: string, scope: Scope): { fileset: Fileset | null; value: string | null } {
    if (this.depth >= MAX_NESTING) {
      throw new Refusal("shell-expansion", "nested too deep");
    }
    const first = this.out.length;
    const sub = new Parser(tokenize(text, this.o), this.ctx, this.o, this.out, this.depth + 1);
    sub.assignedNames = this.assignedNames;
    // It runs when the command it is in does: what that requires, nothing of its own.
    sub.inherited = [...this.inherited, ...this.chain, ...this.fatal];
    sub.list(
      {
        cwd: scope.cwd,
        cwds: [...scope.cwds],
        bindings: new Map(scope.bindings),
        tainted: new Set(scope.tainted),
      },
      null,
    );
    const last = this.out.length - 1;
    if (last >= first) {
      this.out[last] = { ...this.out[last], next: ";" };
    }
    // `git rev-parse --show-toplevel`: the work tree's top, which the kit can read.
    const top =
      /^\s*git\s+rev-parse\s+--show-toplevel\s*$/.test(text) && scope.cwds.length === 1
        ? (this.ctx.gitTop?.(scope.cwds[0]) ?? null)
        : null;
    return {
      fileset: filesetOf(this.out.slice(first)),
      value: top ?? pureValue(this.out.slice(first)),
    };
  }

  simple(scope: Scope, piped: boolean): void {
    const words: Extract<Tok, { t: "word" }>[] = [];
    const redirects: Redirect[] = [];
    const files: FileRedir[] = [];
    const docs: HereDoc[] = [];
    for (;;) {
      const t = this.toks[this.pos];
      if (!t || t.t === "op" || t.t === "close") {
        break;
      }
      if (t.t === "open") {
        throw new Refusal("shell-metacharacter", "(");
      }
      this.pos++;
      if (t.t === "word") {
        words.push(t);
      } else if (t.t === "redir") {
        redirects.push({ text: t.text });
      } else if (t.t === "file") {
        files.push(t.r);
      } else {
        docs.push(t.r);
      }
    }
    if (words.length === 0) {
      throw new Refusal("no-command");
    }
    const ctx = this.ctx;
    // The commands of each $(...) run first (in a subshell, where the command runs);
    // in a command that reads a pipe they would sit between it and its source: refused.
    const inPipeline =
      piped || (this.toks[this.pos]?.t === "op" && (this.toks[this.pos] as { op: Op }).op === "|");
    if (piped && words.some((w) => w.parts.some((p) => p.sub !== undefined))) {
      throw new Refusal("shell-expansion", "$(...) in a pipeline");
    }
    // The tokens are read again for every pass of a loop: what a substitution gives is this pass's own.
    const wparts = words.map((w) =>
      w.parts.map((p): Part => {
        if (p.sub === undefined) {
          return p;
        }
        const r = this.substitute(p.sub, scope);
        // A value the kit knows (quoted, or one with no blank or glob to split on).
        if (r.value !== null && (p.quoted || !/[\s*?[\]]/.test(r.value))) {
          return { s: r.value, quoted: p.quoted };
        }
        return { ...p, fileset: r.fileset ?? undefined };
      }),
    );
    // ${NAME:-WORD}: NAME's value when it is the line's own or a known environment
    // value; WORD when NAME is set nowhere (not the line's, not in the session's
    // environment). Unquoted, a value with a blank or a glob character is refused.
    for (const parts of wparts) {
      for (let j = 0; j < parts.length; j++) {
        const p = parts[j];
        if (!p.dflt || !p.variable) {
          continue;
        }
        const name = p.variable;
        if (scope.tainted?.has(name)) {
          throw new Refusal("shell-expansion", `\${${name}-...} (set where it may not run)`);
        }
        let v: string | null;
        const b = scope.bindings.get(name);
        if (b !== undefined) {
          if (typeof b !== "string") {
            throw new Refusal("shell-expansion", `\${${name}-...}`);
          }
          v = b;
        } else if (name === "HOME" || name === "PWD") {
          v = name === "HOME" ? ctx.home : scope.cwds.length === 1 ? scope.cwds[0] : null;
          if (v === null) {
            throw new Refusal("shell-expansion", `\${${name}-...}`);
          }
        } else if (!ctx.exported || this.assignedNames.has(name)) {
          throw new Refusal("shell-expansion", `\${${name}-...}`);
        } else if (Object.hasOwn(ctx.exported, name)) {
          v = envValue(ctx, name);
          if (v === null) {
            throw new Refusal("shell-expansion", `\${${name}-...}`);
          }
        } else {
          v = null; // unset
        }
        const out = v === null || (p.dflt.colon && v === "") ? p.dflt.word : v;
        if (!p.quoted && /[\s*?[\]]/.test(out)) {
          throw new Refusal("shell-expansion", `\${${name}-...}`);
        }
        parts[j] = { s: out, quoted: true };
      }
    }
    // `$NAME` unquoted, NAME the line's own variable holding a literal with blanks:
    // the shell splits it into one word per field (bash; zsh passes it whole, which
    // the path rules read the same, as the words joined by a blank). Only as an
    // argument, never with a glob character in it, and only with IFS the default.
    const fieldsOf = (parts: readonly Part[]): string[] | null => {
      const solid = parts.filter((p) => !(p.s === "" && !p.variable && !p.unknown && !p.sub));
      const p = solid.length === 1 ? solid[0] : null;
      if (!p?.variable || !p.split || p.quoted || scope.tainted?.has(p.variable)) {
        return null;
      }
      const v = scope.bindings.get(p.variable);
      if (typeof v !== "string" || !/[ \t\n]/.test(v)) {
        return null;
      }
      if (/[*?[\]]/.test(v) || Object.hasOwn(ctx.exported ?? {}, "IFS")) {
        throw new Refusal("shell-expansion", `$${p.variable}`);
      }
      const f = v.split(/[ \t\n]+/).filter(Boolean);
      if (f.length === 0) {
        throw new Refusal("shell-expansion", `$${p.variable} (empty)`);
      }
      return f;
    };
    const fields = wparts.map(fieldsOf);
    const infos = wparts.map((parts, j): WordInfo => {
      const f = fields[j];
      return f ? { text: f.join(" "), unknown: false, fileset: null } : wordInfo(parts, ctx, scope);
    });
    const assigns: { name: string; value: string }[] = [];
    let k = 0;
    // A word is an assignment only when its name part is unquoted text.
    // NAME=$(...) alone: NAME's value is not known (it reads as unknown later: only
    // echo, printf and test take it). The substitution's commands are read as any.
    const unknownAssigns: string[] = [];
    while (k < infos.length && ASSIGN.test(infos[k].text) && isAssignWord(words[k])) {
      const m = ASSIGN.exec(infos[k].text) as RegExpExecArray;
      if (infos[k].unknown) {
        if (infos[k].fileset || !wparts[k].some((p) => p.sub !== undefined)) {
          throw new Refusal("shell-expansion", "an assignment of an unknown value");
        }
        unknownAssigns.push(m[1]);
      } else {
        assigns.push({ name: m[1], value: m[2] });
      }
      k++;
    }
    if (unknownAssigns.length && k < infos.length) {
      throw new Refusal("shell-expansion", "an assignment of an unknown value");
    }
    const texts = infos.map((x) => x.text);
    if (k < infos.length && infos[k].unknown) {
      throw new Refusal("shell-expansion", "an unknown command");
    }
    // The command word from a variable the line set: what runs is the line's own text.
    if (
      k < words.length &&
      words[k].parts.some((p) => p.variable && this.assignedNames.has(p.variable))
    ) {
      throw new Refusal("shell-expansion", "a variable as the command");
    }
    // The values the kit cannot know: an argument of a command that only prints
    // or compares it, or a file name from a listed set given to a command that reads files.
    const unknown = infos.slice(k + 1).filter((x) => x.unknown);
    const filesets: Fileset[] = [];
    if (unknown.length) {
      const name = texts[k] ?? "";
      if (FILE_READERS.has(name) && unknown.every((x) => x.fileset)) {
        filesets.push(...unknown.map((x) => x.fileset as Fileset));
      } else if (!TAKES_UNKNOWN.has(name) || unknown.some((x) => x.fileset)) {
        throw new Refusal("shell-expansion", "$(...)");
      }
    }
    const unknownArgs = unknown.length > 0;
    let argv = texts.slice(k).flatMap((t, j) => fields[k + j] ?? [t]);
    // Which words the shell expands as file patterns: an unquoted *, ? or [ (in
    // the text, or in an unquoted variable's value). Field-split values never
    // hold one (refused above).
    // (`[` is one only with a `]` after it in the word: `[` alone is the test command.)
    const PATTERN = /[*?]|\[[^\]]*\]/;
    const globbedWord = (parts: readonly Part[], text: string) =>
      PATTERN.test(text) &&
      parts.some((p) => !p.quoted && (p.variable !== undefined || /[*?[]/.test(p.s)));
    const globbed = texts
      .slice(k)
      .flatMap((t, j) =>
        fields[k + j]
          ? (fields[k + j] as string[]).map(() => false)
          : [globbedWord(words[k + j].parts, t)],
      );
    const argvAsWords = argv;
    // export NAME=VALUE ...: an assignment the line's later programs also see.
    const exporting =
      argv[0] === "export" &&
      words[k].parts.every((p) => !p.quoted && !p.variable && !p.unknown) &&
      assigns.length === 0 &&
      unknownAssigns.length === 0;
    if (exporting) {
      // Every word NAME=VALUE with a literal value and a name exportedName allows,
      // none already exported by the session: the line's variables, also passed to
      // the programs after it. Any other export form stays the export builtin (not read-only).
      const rest = argv.slice(1);
      const ex: { name: string; value: string }[] = [];
      let ok =
        rest.length > 0 &&
        !files.length &&
        !docs.length &&
        Boolean(ctx.env && ctx.exported) &&
        !infos.slice(k + 1).some((x) => x.unknown) &&
        this.maybeSkipped === 0 &&
        this.loopDepth === 0;
      for (let j = 0; ok && j < rest.length; j++) {
        const m = ASSIGN.exec(rest[j]);
        ok =
          Boolean(m) &&
          isAssignWord(words[k + 1 + j]) &&
          !fields[k + 1 + j] &&
          exportedName((m as RegExpExecArray)[1]) &&
          !Object.hasOwn(ctx.exported ?? {}, (m as RegExpExecArray)[1]);
        if (ok) {
          ex.push({ name: (m as RegExpExecArray)[1], value: (m as RegExpExecArray)[2] });
        }
      }
      if (ok) {
        for (const e of ex) {
          this.assignedNames.add(e.name);
          this.assignments++;
          scope.tainted?.delete(e.name);
          scope.bindings.set(e.name, e.value);
        }
        this.emit({
          argv,
          assigns: [],
          exports: ex,
          redirects,
          cwd: scope.cwd,
          cwds: scope.cwds,
          piped,
          next: null,
        });
        return;
      }
    }
    if (argv.length === 0) {
      // NAME=VALUE alone: a shell variable for what follows, when it is the shell's own
      // (lower case, not in the session's environment, so nothing exported changes).
      if (
        files.length ||
        docs.length ||
        !ctx.env ||
        !ctx.exported ||
        [...assigns.map((a) => a.name), ...unknownAssigns].some(
          (n) => !shellOwnName(n) || Object.hasOwn(ctx.exported ?? {}, n),
        )
      ) {
        throw new Refusal("env-assignment");
      }
      for (const n of unknownAssigns) {
        // Its value is not known: never bound (a later $NAME reads as unknown).
        this.assignedNames.add(n);
        this.assignments++;
        scope.bindings.delete(n);
        scope.tainted?.delete(n);
      }
      for (const a of assigns) {
        this.assignedNames.add(a.name);
        this.assignments++;
        if (this.maybeSkipped > 0 || this.loopDepth > 0) {
          // It may not happen, or happens once per pass: its value after is not known.
          scope.tainted?.add(a.name);
          scope.bindings.delete(a.name);
        } else {
          scope.tainted?.delete(a.name);
          scope.bindings.set(a.name, a.value);
        }
      }
      this.emit({
        argv: ["true"],
        assigns: [],
        redirects,
        cwd: scope.cwd,
        cwds: scope.cwds,
        piped,
        next: null,
      });
      return;
    }
    if (RESERVED.has(argv[0]) && words[k].parts.every((p) => !p.quoted)) {
      throw new Refusal("shell-metacharacter", argv[0]);
    }
    // `[` is the test command; any other glob in the command word is refused.
    if (argv[0] !== "[" && words[k].parts.some((p) => !p.quoted && /[*?[]/.test(p.s))) {
      throw new Refusal("shell-metacharacter", "glob in the command word");
    }
    // find -exec CMD reads the files find yields: every one below its starting points is
    // checked (a fileset); with links followed (-L, -H, -follow) they could be anywhere.
    if (argv[0] === "find" && argv.some((a) => a === "-exec" || a === "-execdir")) {
      if (argv.some((a) => a === "-L" || a === "-H" || a === "-follow")) {
        throw new Refusal("argument-not-read-only", "find following links with -exec");
      }
      const starts: string[] = [];
      let k0 = 1;
      // find's own options before the starting points.
      while (["-P", "-L", "-H", "-D", "-O"].includes(argv[k0])) {
        k0 += argv[k0] === "-D" || argv[k0] === "-O" ? 2 : 1;
      }
      for (const a of argv.slice(k0)) {
        if (a.startsWith("-") || ["!", "(", ")", ","].includes(a)) {
          break;
        }
        starts.push(a);
      }
      if (starts.some((a) => /[*?[]/.test(a))) {
        throw new Refusal(
          "argument-not-read-only",
          "find with a pattern as a starting point and -exec",
        );
      }
      const found: Fileset = {
        roots: [
          ...new Set(
            scope.cwds.flatMap((b) =>
              (starts.length ? starts : ["."]).map((r) => path.resolve(b, r)),
            ),
          ),
        ],
        source: "find",
        bases: scope.cwds,
      };
      filesets.push(found);
      // `-exec sh -c 'SCRIPT' NAME {} ;`: SCRIPT runs once per file found, $0 = NAME and
      // $1 = the file. Its commands are read with $1 bound to what find yields, returned
      // in place of the -exec (find itself then only prints names).
      argv = this.findShellScripts(argv, scope, found);
    }
    const writes: FileWrite[] = [];
    const reads: string[] = [];
    for (const f of files) {
      if (
        !f.target ||
        f.target.some(
          (p) =>
            p.unknown ||
            (!p.quoted && /[*?[]/.test(p.s)) ||
            // A target from a variable the line set: refused, as in the command word.
            (p.variable !== undefined && this.assignedNames.has(p.variable)),
        )
      ) {
        throw new Refusal("redirect", f.op);
      }
      const t = wordText(f.target, ctx, scope);
      if (f.kind === "herestring") {
        // Its text is input, not a file name (an empty word is an empty line).
        redirects.push({ text: "<<<" });
        docs.push({ delim: "<<<", expand: false, strip: false, body: `${t}\n` });
        continue;
      }
      if (t === "") {
        throw new Refusal("redirect", f.op);
      }
      redirects.push({ text: `${f.op}${t}` });
      if (f.kind === "write") {
        writes.push({
          path: t,
          append: f.append,
          stream: f.op.startsWith("2") ? "err" : f.op.startsWith("&") ? "both" : "out",
        });
      } else {
        reads.push(t);
      }
    }
    if (docs.length > 1 || (docs.length && reads.length)) {
      throw new Refusal("redirect", "more than one input");
    }
    for (const d of docs) {
      if (d.delim !== "<<<") {
        redirects.push({ text: `<<${d.delim}` });
      }
    }
    // `find ... -print0 | xargs -0 CMD`: CMD gets exactly the names find lists
    // (NUL-separated, so no name is split or unquoted): a set every file of which is checked.
    let xargsListed = false;
    if (argv[0] === "xargs" && piped && argv.some((a) => a === "-0" || a === "--null")) {
      const prev = this.out[this.out.length - 1];
      if (
        prev &&
        !prev.piped &&
        prev.argv[0] === "find" &&
        prev.argv[prev.argv.length - 1] === "-print0" &&
        !(prev.writes?.length || prev.reads?.length)
      ) {
        const listed = filesetOf([{ ...prev, argv: prev.argv.slice(0, -1) }]);
        if (listed) {
          filesets.push(listed);
          xargsListed = true;
        }
      }
    }
    const extraSets = filesets.length
      ? { filesets, ...(xargsListed ? { xargsListed: true } : {}) }
      : {};
    const extra = this.o.fileRedirects
      ? { writes, reads, stdin: docs.length ? (docs[0].body ?? "") : null }
      : {};
    const inPipe = inPipeline;
    if (globbed.some(Boolean) && argv !== argvAsWords) {
      throw new Refusal("shell-metacharacter", "*");
    }
    const commandWord = {
      name: texts[k],
      aliasable: words[k].parts.every(
        (p) => !p.quoted && !p.variable && !p.unknown && p.sub === undefined && !p.brace,
      ),
    };
    const base = {
      argv,
      ...(globbed.some(Boolean) ? { globbed } : {}),
      assigns,
      commandWord,
      redirects,
      cwd: scope.cwd,
      cwds: scope.cwds,
      piped,
      next: null,
      ...extra,
      ...extraSets,
      ...(unknownArgs ? { unknownArgs: true } : {}),
    };
    if (argv[0] === "cd") {
      // A redirection on cd changes nothing (only harmless ones parse); a pipeline or an assignment would.
      if (inPipe || assigns.length || files.length || docs.length) {
        throw new Refusal("shell-metacharacter", "cd in a pipeline");
      }
      const dirs = argv.slice(1).filter((a) => a !== "--");
      // `cd A B ...` fails ("too many arguments") and changes nothing; as the line's last
      // command nothing runs after it (zsh's two-word cd may move, and still nothing runs).
      const atEnd =
        this.depth === 0 && this.toks.slice(this.pos).every((t) => t.t === "op" && t.op === ";");
      if (argv.length > 2 && !argv[1].startsWith("-") && atEnd) {
        this.emit({ ...base, argv: ["false"] });
        return;
      }
      if (dirs.length > 1 || argv.slice(1).some((a) => a.startsWith("-") && a !== "--")) {
        throw new Refusal("argument-not-read-only", "cd takes one directory");
      }
      const target = dirs[0] ?? ctx.home;
      if (!target || /[*?[]/.test(target)) {
        throw new Refusal("argument-not-read-only", "cd to an unknown directory");
      }
      this.emit(base);
      const moved = scope.cwds.map((d) => path.resolve(d, target));
      scope.cwd = path.resolve(scope.cwd, target);
      // After `&&` the rest runs only where the cd succeeded; after `;` or `||` it may run in either.
      const nx = this.toks[this.pos];
      const and = nx?.t === "op" && nx.op === "&&";
      scope.cwds = [...new Set(and ? moved : [...moved, ...scope.cwds])];
      if (scope.cwds.length > 8) {
        throw new Refusal("argument-not-read-only", "too many cd");
      }
    } else {
      this.emit(base);
    }
    if (this.out.length > MAX_COMMANDS) {
      throw new Refusal("command-too-long", "too many commands");
    }
  }
}

/** A word whose name part (up to `=`) is unquoted literal text: an assignment, when in front. */
function isAssignWord(w: Extract<Tok, { t: "word" }>): boolean {
  let lead = "";
  for (const p of w.parts) {
    if (p.quoted || p.variable || p.unknown) {
      break;
    }
    lead += p.s;
    if (lead.includes("=")) {
      break;
    }
  }
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(lead);
}

/**
 * Parse `command` into the simple commands the shell runs, each with the
 * directory it runs in. A command outside the accepted grammar is refused
 * with the code the read-only classifier reports for it.
 */
export function parseCompound(
  command: unknown,
  ctx: ShellContext,
  o: CompoundOptions = {},
): CompoundParse {
  if (typeof command !== "string") {
    return refuse("no-command");
  }
  if (command.length > MAX_LEN) {
    return refuse("command-too-long");
  }
  const commands: SimpleCommand[] = [];
  // The session's environment, as far as the line leaves it alone.
  ctx = { ...ctx, env: lineEnv(command, ctx.env), exported: ctx.env ?? null };
  try {
    const p = new Parser(tokenize(command, o), ctx, o, commands, 0);
    p.list(
      {
        cwd: path.resolve(ctx.cwd),
        cwds: [path.resolve(ctx.cwd)],
        bindings: new Map(),
        tainted: new Set(),
      },
      null,
    );
  } catch (err) {
    return err instanceof Refusal ? refuse(err.code, err.detail) : refuse("unparseable");
  }
  if (commands.length === 0) {
    return refuse("no-command");
  }
  if (commands.length > MAX_COMMANDS) {
    return refuse("command-too-long", "too many commands");
  }
  return {
    ok: true,
    commands: commands.map((c, k) => (k === commands.length - 1 ? { ...c, next: null } : c)),
  };
}
