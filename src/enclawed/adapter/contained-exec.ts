// enclawed adapter kit: contained execution of the agent's shell commands.
//
// A command that is not provably read-only (`node --test`, `npm test`, a
// project script) can still be reversible by construction: it runs inside
// Enclawed's containment (../containment: an empty-root view with only the
// project read-write and the toolchain read-only, the name guard that
// refuses writes to files that configure what runs later, no inherited
// environment or credentials, the network only through the relay to
// declared destinations), and every project file git does not hold as it
// is now is snapshotted into Enclawed's history first (snapshotProject).
// What such a run changes can then be put back, so it needs no person.
//
// Containment is the guarantee; this module decides which commands are
// offered it, by reading what they run. What it read is then enforced by
// the containment itself (code pins, ../containment/code-guard.ts): the run
// loads and executes no code from the project or a writable place but the
// files read here, with the bytes read here, so the run does not depend on
// this reading being complete. A command line is offered containment only
// when every simple command in it is one of:
//
//   - read-only (the strict allowlist), with git commands checked against
//     the programs the repository's configuration makes them start;
//   - `cd DIR`, `env [-i] [-u NAME] [NAME=VALUE] CMD`, NAME=VALUE in front,
//     `timeout DURATION CMD`; the builtins that change nothing (exit, true,
//     false, :, test, [, set with options only); `env`/`printenv` alone (in
//     containment they print the containment's own environment, built from
//     nothing: no credential of this machine is in it);
//   - a program that only reads project files and prints (strings, od, file,
//     xxd, hexdump, base64, sha*sum/md5sum, cmp, zcat, gzip/pigz -dc,
//     openssl zlib -d -in FILE, sqlite3 with read-only SQL or dot-commands),
//     or that only creates or changes project files (mkdir, touch, cp
//     without recursion, chmod): files it creates or changes are decided as
//     the equivalent Write/Edit, and every file it reads is checked like a
//     read (a credential store or a file holding a secret is never read);
//   - git add / commit (-m or -F) / revert --no-edit, and git config
//     reads, clean dry runs, submodule status, diff --no-index, diff-tree,
//     only while the repository's configuration names nothing git could start
//     (only known inert keys, no hook in its hooks directory);
//   - a runner of code Enclawed reads: node (a script, --test with its test
//     files, -e/-p code), python (a script, -m pytest/unittest, -c code),
//     sh/bash/dash (a script, -c with a line read again by these rules),
//     source/. (a script), a project file run directly (by its shebang),
//     and npm/pnpm/yarn/bun test / run X (the package.json the script is
//     defined in must equal git's committed copy: a changed definition is
//     an execution-configuration change; the script text is read again by
//     these rules);
//
// and the code read (each script, each test file, the project files they
// import, inline code) shows none of what containment cannot take back or
// a person must decide: the network (fetch, http, sockets, DNS, a URL),
// starting other programs, deleting or renaming files, loading code that
// cannot be read (eval, a computed import), a literal name of a file that
// holds a secret (its content would reach the model through the run's
// output). A file code writes by a literal name is decided as the equivalent
// Write (a file that configures what runs later asks; ./engine.ts
// decideFsWrite). A variable assignment may not
// change what commands run (NODE_OPTIONS, PATH, LD_PRELOAD, ...) except to
// empty it; and while the repository's settings set such a variable for
// the host, a runner must set or clear it itself. Everything else keeps
// the ordinary rule: irreversible, a person decides.

import { createHash } from "node:crypto";
import fs from "node:fs";
import { isBuiltin as isNodeBuiltin } from "node:module";
import path from "node:path";
import { commandReachesCredential, readReachesCredential } from "./credentials.js";
import { changesShellCommands } from "./env-trust.js";
import { expandHome, isInside, type FsProbe } from "./fs-probe.js";
import { gitCommandStarts } from "./git-programs.js";
import { isExecConfigDir, isExecConfigPath } from "./rule-kit.js";
import { parseCompound, type SimpleCommand } from "./shell-compound.js";
import { classifyArgv } from "./shell-readonly.js";

export type ContainedVerdict =
  | Readonly<{
      ok: true;
      /** Every code file Enclawed read (real paths): the only project code the contained run may load. */
      files: readonly string[];
      /** Of those, the files the line runs directly (by their shebang): executable in the view. */
      executed: readonly string[];
      /** Files edited in place by `sed -i` (absolute): decided like the equivalent Edit. */
      writes: readonly string[];
      /** Whether anything runs besides read-only commands and in-place edits (then it needs containment). */
      runs: boolean;
      /** Project files it deletes (rm), absolute. */
      deletes: readonly string[];
      /** Of those, the ones a command the rm requires copied first: the copy survives. */
      backedUp: readonly string[];
      /** What each cp of the line copies, and to where (absolute, as the line names them). */
      copies: readonly Readonly<{ source: string; dest: string }>[];
    }>
  | Readonly<{ ok: false; why: string }>;

export type ContainedContext = Readonly<{
  projectDir: string;
  home: string | null;
  fs: Pick<FsProbe, "realpathNearest" | "gitPrograms">;
  /** Variables the repository's settings set that change what commands run (EngineOptions.repositoryEnv). */
  repositoryEnv: readonly string[];
  /** Whether `file` (inside the project) equals git's committed copy. */
  equalsCommitted: (file: string) => boolean;
  /**
   * Existing project files the same line writes before it runs anything
   * (real path -> their content then): code is read as the line leaves it.
   */
  overlay?: ReadonlyMap<string, string>;
}>;

const MAX_DEPTH = 4;
const MAX_FILES = 400;
const MAX_FILE_BYTES = 512 * 1024;

class NotContained extends Error {}
function no(why: string): never {
  throw new NotContained(why);
}

// ─── What code shows ────────────────────────────────────────────────────

const JS_MODULES =
  /(?:require\s*\(\s*|from\s+|import\s*\(\s*|import\s+)['"`](?:node:)?(child_process|cluster|net|tls|https?|http2|dgram|dns|inspector|worker_threads|vm|module)(?:\/[^'"`]*)?['"`]/;
const JS_EFFECTS: readonly [RegExp, string][] = [
  [
    /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bnavigator\.sendBeacon\b/,
    "reaches the network",
  ],
  [
    /\b(?:unlink|unlinkSync|rmSync|rmdir|rmdirSync|rename|renameSync|truncate|truncateSync)\s*\(|\.rm\s*\(|\bfs\.promises\.rm\b/,
    "deletes or renames files",
  ],
  [
    /\beval\s*\(|\bnew\s+Function\b|\bprocess\.(?:binding|dlopen|_linkedBinding)\b/,
    "runs code it builds at run time",
  ],
  [/\bimport\s*\(\s*[^'"`\s]|\brequire\s*\(\s*[^'"`\s)]/, "loads a module whose name it computes"],
  [
    /\bprocess\.kill\b|\bprocess\.setuid\b|\bprocess\.chdir\s*\(\s*['"`]\//,
    "acts on other processes or the system",
  ],
];
const PY_EFFECTS: readonly [RegExp, string][] = [
  [
    /\bos\s*\.\s*(?:system|popen|remove|unlink|rmdir|removedirs|rename|replace|exec\w*|spawn\w*|fork\w*|kill\w*|posix_spawn\w*)\b|\.unlink\s*\(|\.rmdir\s*\(|\.rename\s*\(|\.truncate\s*\(|\brmtree\b/,
    "starts programs or deletes files",
  ],
  [
    // os under another name, or its functions imported by name: not followed here.
    /^\s*import\s+[^\n#]*\bos\s+as\b|^\s*from\s+os\s+import\b|^\s*from\s+posix\s+import\b|^\s*import\s+[^\n#]*\bposix\b/m,
    "uses os under another name, so what it calls is not read here",
  ],
  [
    /\b(?:eval|exec|__import__|compile|getattr|setattr|globals|vars|breakpoint)\s*\(|__builtins__|__dict__|__subclasses__|__globals__/,
    "runs code it builds at run time or reaches functions by a computed name",
  ],
];
const URL_IN_CODE = /\b(?:https?|wss?|ftp):\/\/[^\s'"`]+/;
const DEV_NET = /\/dev\/(?:tcp|udp)\//;

/** The relative modules a JS file imports (static forms only; a computed one is refused above). */
function jsImports(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(
    /(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*)['"`](\.{1,2}\/[^'"`]+|\/[^'"`]+)['"`]/g,
  )) {
    out.push(m[1]);
  }
  return out;
}

// ─── The scan ───────────────────────────────────────────────────────────

type Scan = {
  ctx: ContainedContext;
  files: Set<string>;
  executed: Set<string>;
  writes: Set<string>;
  runs: boolean;
  /** Where the command being read runs (relative names in its code resolve here). */
  cwd: string;
  /** Project files the line deletes (rm): decided by ./engine.ts (only files this session created). */
  deletes: Set<string>;
  /** Whether an earlier command of the line may create files (so a missing program may exist by then). */
  mayCreate: boolean;
  /** The command list being read and the position in it (for `requires`, ./shell-compound.ts). */
  line: readonly SimpleCommand[] | null;
  pos: number;
  /** Files a cp of this line copied: source -> where its copy lands, and which command copied it. */
  copies: Map<string, { dest: string; line: readonly SimpleCommand[] | null; pos: number }>;
  /** Files the line deletes only after a command it requires copied them (their copy survives). */
  backedUp: Set<string>;
  /** Whether the line runs code (a script, a runner): it could change any project file between commands. */
  ranCode: boolean;
  /** Every path an rm of the line names (there now or not: the line may create it first). */
  removed: Set<string>;
  byName?: Map<string, string[]>;
};

function readCode(scan: Scan, file: string): { real: string; text: string } {
  const real = scan.ctx.fs.realpathNearest(file);
  if (!isInside(scan.ctx.projectDir, real)) {
    no(`it runs ${real}, which is outside the project`);
  }
  let st: fs.Stats;
  try {
    st = fs.statSync(real);
  } catch {
    // A missing file: the runner fails without running anything.
    return { real, text: "" };
  }
  if (!st.isFile()) {
    no(`it runs ${real}, which is not a regular file`);
  }
  if (st.size > MAX_FILE_BYTES) {
    no(`it runs ${real}, which is too large for Enclawed to read`);
  }
  if (scan.files.size >= MAX_FILES) {
    no("it runs more files than Enclawed reads for one command");
  }
  scan.files.add(real);
  const later = scan.ctx.overlay?.get(real);
  return { real, text: later ?? fs.readFileSync(real, "utf8") };
}

// A literal absolute or home path in code: where it points is outside what the view shows.
const OUTSIDE_LITERAL =
  /['"`](~\/[^'"`\s]*|\/(?!dev\/(?:null|stdin|stdout|stderr)['"`])[A-Za-z0-9._~-][^'"`\s]*)['"`]/g;

/** A literal path in code that leaves the project (the containment would refuse it; a person decides). */
function checkPaths(text: string, projectDir: string, what: string): void {
  for (const m of text.matchAll(OUTSIDE_LITERAL)) {
    const p = m[1];
    if (p.startsWith("~") || !isInside(projectDir, p)) {
      no(`${what} names a path outside the project (${p.slice(0, 120)})`);
    }
  }
}

// ─── What code reads and writes by name ─────────────────────────────────

/** The project's regular files by base name (bounded walk; .git and regenerated trees skipped). */
function projectFilesByName(scan: Scan): Map<string, string[]> {
  if (scan.byName) {
    return scan.byName;
  }
  const out = new Map<string, string[]>();
  let left = 20_000;
  const walk = (d: string, depth: number) => {
    if (depth > 12 || left <= 0) {
      return;
    }
    let ents: fs.Dirent[] = [];
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (--left <= 0) {
        return;
      }
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== ".git" && !REGENERATED.has(e.name)) {
          walk(p, depth + 1);
        }
      } else if (e.isFile()) {
        out.set(e.name, [...(out.get(e.name) ?? []), p]);
      }
    }
  };
  walk(scan.ctx.projectDir, 0);
  scan.byName = out;
  return out;
}

const STRING_LITERAL = /(['"`])((?:(?!\1)[^\\\n])+)\1/g;

/**
 * A file of the project that holds a secret, named by a literal in code (by
 * its base name, wherever the code joins it): running the code would put the
 * secret in the run's output, which reaches the model.
 */
function checkSecretLiterals(scan: Scan, text: string, what: string): void {
  const byName = projectFilesByName(scan);
  for (const m of text.matchAll(STRING_LITERAL)) {
    const lit = m[2];
    if (lit.length > 300 || /\s/.test(lit)) {
      continue;
    }
    for (const f of byName.get(path.basename(lit)) ?? []) {
      const hit = readReachesCredential(scan.ctx.fs, f, scan.ctx.home, false);
      if (hit) {
        no(
          `${what} names ${path.relative(scan.ctx.projectDir, f)}, which holds ${hit.what.replace(/^a file that holds /, "")}: its content would reach the model`,
        );
      }
    }
  }
}

/** Files code writes by a literal name (JS fs writes, Python open for writing, Path.write_*). */
const JS_WRITE =
  /\b(?:writeFileSync|appendFileSync|writeFile|appendFile|createWriteStream|copyFileSync|copyFile|cpSync|cp|symlinkSync|symlink|linkSync|link|chmodSync|chmod|mkdirSync|mkdir)\s*\(\s*(['"`])([^'"`$\n]+)\1/g;
const PY_WRITE =
  /\bopen\s*\(\s*(['"])([^'"\n]+)\1\s*,\s*(?:mode\s*=\s*)?['"][^'"]*[wax+][^'"]*['"]|\bPath\s*\(\s*(['"])([^'"\n]+)\3\s*\)\s*\.\s*(?:write_text|write_bytes|touch|mkdir|chmod|symlink_to|hardlink_to)\b/g;

function literalWrites(scan: Scan, text: string, lang: "js" | "py", cwd: string): void {
  if (lang === "js") {
    for (const m of text.matchAll(JS_WRITE)) {
      // cp/copyFile/link name the target second; the source is read, the target written.
      const call = m[0];
      const two =
        /\b(?:copyFileSync|copyFile|cpSync|cp|symlinkSync|symlink|linkSync|link)\s*\(/.test(call);
      if (two) {
        const rest = text.slice((m.index ?? 0) + m[0].length);
        const second = /^\s*,\s*(['"`])([^'"`$\n]+)\1/.exec(rest);
        if (!second) {
          no("its code copies or links a file to a name it computes");
        }
        scan.writes.add(path.resolve(cwd, second[2]));
      } else {
        scan.writes.add(path.resolve(cwd, m[2]));
      }
    }
  } else {
    for (const m of text.matchAll(PY_WRITE)) {
      scan.writes.add(path.resolve(cwd, m[2] ?? m[4]));
    }
  }
  for (const w of scan.writes) {
    if (!isInside(scan.ctx.projectDir, scan.ctx.fs.realpathNearest(w))) {
      no(`its code writes ${w}, outside the project`);
    }
  }
}

function checkText(text: string, effects: readonly [RegExp, string][], what: string): void {
  if (URL_IN_CODE.test(text) || DEV_NET.test(text)) {
    no(`${what} names a network address`);
  }
  for (const [re, why] of effects) {
    if (re.test(text)) {
      no(`${what} ${why}`);
    }
  }
}

function scanJs(scan: Scan, file: string, depth = 0): void {
  const { real, text } = readCode(scan, file);
  if (depth > 32) {
    no("its imports go deeper than Enclawed reads");
  }
  checkJs(text, path.relative(scan.ctx.projectDir, real), path.dirname(real));
  checkPaths(text, scan.ctx.projectDir, path.relative(scan.ctx.projectDir, real));
  checkSecretLiterals(scan, text, path.relative(scan.ctx.projectDir, real));
  literalWrites(scan, text, "js", scan.cwd);
  for (const rel of jsImports(text)) {
    const target = path.resolve(path.dirname(real), rel);
    const candidates = [
      target,
      `${target}.js`,
      `${target}.mjs`,
      `${target}.cjs`,
      path.join(target, "index.js"),
    ];
    const found = candidates.find((c) => {
      try {
        return fs.statSync(c).isFile();
      } catch {
        return false;
      }
    });
    if (found && !scan.files.has(scan.ctx.fs.realpathNearest(found))) {
      scanJs(scan, found, depth + 1);
    }
  }
}

function checkJs(text: string, what: string, from: string = process.cwd()): void {
  const m = JS_MODULES.exec(text);
  if (m) {
    no(`${what} uses the node module ${m[1]} (programs, the network or code loading)`);
  }
  // A module name the matcher above reads must be one plain literal: an
  // escape (child_\x70rocess), a join or a template could name any module.
  for (const call of text.matchAll(/\b(?:require|import)\s*\(/g)) {
    const rest = text.slice((call.index ?? 0) + call[0].length);
    if (!/^\s*(['"])[^'"`\\$\n]*\1\s*[,)]/.test(rest)) {
      no(`${what} loads a module whose name is not one plain literal`);
    }
  }
  if (/\b(?:from|import)\s*(['"`])[^'"`\n]*[\\$][^'"`\n]*\1/.test(text)) {
    no(`${what} imports a module whose name holds an escape`);
  }
  // Reaching require, process internals or constructors by a computed name.
  if (
    /\b(?:module|process|globalThis|global|require)\s*\[|\.constructor\s*\(|\bReflect\s*\.|\bimport\.meta\.resolve\b/.test(
      text,
    )
  ) {
    no(`${what} reaches code-loading functions by a computed name`);
  }
  // A package (a bare module name that is not one of node's own modules below) is code Enclawed did not read.
  for (const m of text.matchAll(
    /(?:\brequire\s*\(\s*|\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\1/g,
  )) {
    const spec = m[2];
    if (spec.startsWith("./") || spec.startsWith("../")) {
      continue;
    }
    if (spec.startsWith("/") || spec.startsWith("file:")) {
      continue; // read as a file below (jsImports), or refused there
    }
    const bare = spec.replace(/^node:/, "");
    const name = bare.startsWith("@") ? bare.split("/").slice(0, 2).join("/") : bare.split("/")[0];
    if (
      !NODE_SAFE_MODULES.has(name) &&
      (spec.startsWith("node:") || nodePackageExists(name, from))
    ) {
      no(`${what} loads ${spec}, a module whose code Enclawed does not read`);
    }
  }
  checkText(text, JS_EFFECTS, what);
}

/**
 * Whether node could find a package by this name from `dir`: a node_modules
 * entry in `dir` or a directory above it, or a global module directory. None:
 * the import fails and loads nothing (node's own modules are refused above
 * unless known safe).
 */
function nodePackageExists(name: string, dir: string): boolean {
  if (!/^(?:@[\w.-]+\/)?[\w.-]+$/.test(name)) {
    return true;
  }
  if (isNodeBuiltin(name)) {
    return true;
  }
  for (let d = path.resolve(dir); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, "node_modules", name))) {
      return true;
    }
    if (path.dirname(d) === d) {
      break;
    }
  }
  return [
    "/usr/lib/node",
    "/usr/local/lib/node",
    "/usr/lib/node_modules",
    "/usr/local/lib/node_modules",
  ].some((g) => fs.existsSync(path.join(g, name)));
}

/** node's own modules that start no program, reach no network and load no code (the others are refused above). */
const NODE_SAFE_MODULES = new Set([
  "fs",
  "path",
  "os",
  "url",
  "util",
  "assert",
  "test",
  "crypto",
  "events",
  "stream",
  "buffer",
  "string_decoder",
  "readline",
  "zlib",
  "querystring",
  "timers",
  "perf_hooks",
  "process",
  "console",
  "constants",
  "punycode",
  "diagnostics_channel",
  "async_hooks",
  "v8",
  "tty",
]);

function scanPython(scan: Scan, file: string, dirs: readonly string[] | null = null): void {
  const { real, text } = readCode(scan, file);
  checkPythonCode(
    scan,
    text,
    path.relative(scan.ctx.projectDir, real),
    dirs ?? [path.dirname(real)],
  );
}

/**
 * Python modules that start no program, reach no network and load no other
 * code by themselves (os only through the names PY_EFFECTS reads; sqlite3
 * only with read-only SQL). Anything else imported is refused unless it is a
 * project file, which is then read itself.
 */
const PY_SAFE_MODULES = new Set(
  "sys re json os pathlib math cmath collections itertools functools operator string textwrap unicodedata base64 binascii zlib gzip bz2 lzma hashlib hmac struct datetime time calendar csv io codecs difflib html typing dataclasses enum argparse statistics decimal fractions random sqlite3 unittest pprint copy heapq bisect glob fnmatch contextlib abc numbers uuid secrets locale shlex traceback warnings types weakref array tomllib configparser keyword token tokenize ast __future__ dis".split(
    " ",
  ),
);

/**
 * Whether a module by this name could be imported from Python's own
 * directories (the standard library, lib-dynload, dist- and site-packages
 * under /usr and /usr/local). Built-in modules (compiled in) are taken to
 * exist. A name found nowhere: the import fails and nothing is loaded.
 */
function pythonModuleExists(name: string): boolean {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name) || PY_BUILTINS.has(name)) {
    return true;
  }
  for (const base of ["/usr/lib", "/usr/local/lib", "/usr/lib64", "/usr/local/lib64"]) {
    let vers: string[] = [];
    try {
      vers = fs.readdirSync(base).filter((v) => /^python3(?:\.\d+)?$/.test(v));
    } catch {
      continue;
    }
    for (const v of vers) {
      for (const sub of ["", "lib-dynload", "dist-packages", "site-packages"]) {
        const d = path.join(base, v, sub);
        let names: string[] = [];
        try {
          names = fs.readdirSync(d);
        } catch {
          continue;
        }
        if (names.some((n) => n === name || n === `${name}.py` || n.startsWith(`${name}.`))) {
          return true;
        }
      }
    }
  }
  return false;
}

/** Modules compiled into CPython (sys.builtin_module_names of 3.12/3.13, superset). */
const PY_BUILTINS = new Set(
  "_abc _ast _codecs _collections _functools _imp _io _locale _operator _signal _sre _stat _string _symtable _thread _tokenize _tracemalloc _typing _warnings _weakref atexit builtins errno faulthandler gc itertools marshal posix pwd sys time xxsubtype".split(
    " ",
  ),
);

/** The modules a Python text imports (import a.b as c, d / from a.b import x), statement by statement. */
function pyImports(text: string): string[] {
  const out: string[] = [];
  for (const stmt of text.split(/[\n;]/)) {
    const st = stmt.trim();
    const im = /^import\s+(.+)$/.exec(st);
    if (im) {
      for (const part of im[1].split(",")) {
        const name = part.trim().split(/\s+/)[0];
        if (!/^[\w.]+$/.test(name)) {
          no(`an import Enclawed does not read (${st.slice(0, 80)})`);
        }
        out.push(name);
      }
      continue;
    }
    const fm = /^from\s+(\S+)\s+import\b/.exec(st);
    if (fm) {
      if (fm[1].startsWith(".")) {
        no(`a relative import Enclawed does not read (${st.slice(0, 80)})`);
      }
      out.push(fm[1]);
    }
  }
  return out;
}

/** SQL a Python sqlite3 program runs: every execute argument a literal that only reads. */
function checkPySqlite(text: string, what: string): void {
  if (
    /\b(?:executescript|create_function|create_aggregate|create_collation|create_window_function|enable_load_extension|load_extension|set_authorizer|set_trace_callback|backup|deserialize)\b/.test(
      text,
    )
  ) {
    no(`${what} uses sqlite3 beyond reading`);
  }
  for (const m of text.matchAll(/\.execute(?:many)?\s*\(/g)) {
    const rest = text.slice((m.index ?? 0) + m[0].length);
    const lit = /^\s*(?:'''([\s\S]*?)'''|"""([\s\S]*?)"""|'([^'\\\n]*)'|"([^"\\\n]*)")\s*[,)]/.exec(
      rest,
    );
    const sql = lit ? (lit[1] ?? lit[2] ?? lit[3] ?? lit[4]) : null;
    if (sql == null || SQL_WRITES.test(sql) || !/^\s*(?:select|with|explain)\b/i.test(sql)) {
      no(`${what} runs SQL that may change the database or is not one literal`);
    }
  }
}

/**
 * Python code: its effects (PY_EFFECTS), the paths and secrets it names, the
 * files it writes by name, and every module it imports: a project file found
 * first on its path (`dirs`, as Python searches them) is read in turn; any
 * other must be a module of PY_SAFE_MODULES.
 */
function checkPythonCode(scan: Scan, text: string, what: string, dirs: readonly string[]): void {
  checkText(text, PY_EFFECTS, what);
  checkPaths(text, scan.ctx.projectDir, what);
  checkSecretLiterals(scan, text, what);
  literalWrites(scan, text, "py", scan.cwd);
  // sys.path changed by literal directories: searched like Python searches them.
  const searched = [...dirs];
  for (const m of text.matchAll(/\bsys\.path\.(insert|append|extend)\s*\(([^)]*)\)/g)) {
    const lit = /^\s*(?:\d+\s*,\s*)?(['"])([^'"\n]*)\1\s*$/.exec(m[2]);
    if (!lit) {
      no(`${what} changes sys.path with a value Enclawed does not read`);
    }
    const d = path.resolve(scan.cwd, lit[2] || ".");
    if (m[1] === "insert") {
      searched.unshift(d);
    } else {
      searched.push(d);
    }
  }
  if (/\bsys\.path\s*(?:=|\+=|\[)|\bsys\.meta_path\b|\bsys\.path_hooks\b/.test(text)) {
    no(`${what} changes how Python finds modules`);
  }
  let sqlite = false;
  for (const mod of pyImports(text)) {
    const top = mod.split(".")[0];
    let found: string | null = null;
    for (const d of searched) {
      for (const c of [path.join(d, `${top}.py`), path.join(d, top, "__init__.py")]) {
        try {
          if (fs.statSync(c).isFile()) {
            found = c;
            break;
          }
        } catch {
          /* not here */
        }
      }
      if (found) {
        break;
      }
      if (fs.existsSync(path.join(d, top))) {
        no(`${what} imports ${top}, a directory Enclawed does not read as a module`);
      }
    }
    if (found) {
      if (!scan.files.has(scan.ctx.fs.realpathNearest(found))) {
        scanPython(scan, found, searched);
      }
    } else if (!PY_SAFE_MODULES.has(top) && pythonModuleExists(top)) {
      no(`${what} imports ${mod}, a module whose code Enclawed does not read`);
    } else if (top === "sqlite3") {
      sqlite = true;
    }
  }
  if (sqlite || /\bsqlite3\b/.test(text)) {
    checkPySqlite(text, what);
  }
}

function checkPython(scan: Scan, args: readonly string[], cwd: string): void {
  let i = 0;
  let isolated = false;
  while (i < args.length && /^-[IBEsuOqP]+$/.test(args[i])) {
    isolated ||= /[IP]/.test(args[i]);
    i++;
  }
  const a = args[i];
  if (a === "-c") {
    // -c: the current directory is searched first, unless isolated (-I, -P).
    checkPythonCode(scan, args[i + 1] ?? "", "the inline code", isolated ? [] : [cwd]);
    return;
  }
  if (a === "-m") {
    const mod = args[i + 1];
    if (mod !== "pytest" && mod !== "unittest") {
      no(`python -m ${mod ?? ""} is not a module Enclawed reads`);
    }
    const walk = (d: string, depth: number) => {
      if (depth > 10) {
        return;
      }
      let ents: fs.Dirent[] = [];
      try {
        ents = fs.readdirSync(d, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of ents) {
        if ([".git", "node_modules", ".venv", "venv", "__pycache__"].includes(e.name)) {
          continue;
        }
        const p = path.join(d, e.name);
        if (e.isDirectory()) {
          walk(p, depth + 1);
        } else if (/^(test_.*|.*_test|conftest)\.py$/.test(e.name)) {
          // pytest puts the test file's directory and the root on the path.
          scanPython(scan, p, [path.dirname(p), cwd]);
        }
      }
    };
    walk(cwd, 0);
    return;
  }
  if (a === undefined || a.startsWith("-")) {
    no(`python ${a ?? ""} is not a form Enclawed reads`);
  }
  const file = path.resolve(cwd, a);
  scanPython(scan, file, isolated ? [] : [path.dirname(file)]);
}

/** The end of a balanced `(`...`)` group that opens at `from` (the index of "("), or -1. */
function closeParen(text: string, from: number): number {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    if (text[i] === "(") {
      depth++;
    } else if (text[i] === ")") {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * A script line with each arithmetic expansion `$(( ... ))` read and replaced
 * by a number: its text may hold only digits, operators, parentheses and
 * command substitutions, and each substitution's commands are read by these
 * rules (a file they read by `<` is read like any read; one they write is
 * refused). Anything else in it (a name, a subscript): the line is left as it is.
 */
function arithmeticRead(scan: Scan, line: string, cwd: string, depth: number): string {
  let out = line;
  for (let at = out.indexOf("$(("); at >= 0; at = out.indexOf("$((")) {
    const end = closeParen(out, at + 1);
    if (end < 0 || out[end - 1] !== ")") {
      return out;
    }
    const expr = out.slice(at + 3, end - 1);
    let rest = "";
    for (let i = 0; i < expr.length; i++) {
      if (expr.startsWith("$(", i)) {
        const e = closeParen(expr, i + 1);
        if (e < 0) {
          return out;
        }
        const p = parseCompound(
          expr.slice(i + 2, e),
          { cwd, home: scan.ctx.home },
          { fileRedirects: true },
        );
        if (!p.ok) {
          return out;
        }
        for (const c of p.commands) {
          if (c.writes?.length || (c.stdin ?? null) !== null) {
            no("an arithmetic expansion whose command writes a file or reads a here-document");
          }
          for (const r of c.reads ?? []) {
            readable(scan, c.cwd, r);
          }
        }
        checkCommands(
          scan,
          p.commands.map((c) => ({ ...c, reads: [] })),
          depth + 1,
        );
        i = e;
      } else {
        rest += expr[i];
      }
    }
    if (!/^[\s\d+\-*/%()]*$/.test(rest)) {
      return out;
    }
    out = `${out.slice(0, at)}0${out.slice(end + 1)}`;
  }
  return out;
}

/** Words a script's positional parameters may stand for in its text (no quote, no expansion). */
const PLAIN_WORD = /^[A-Za-z0-9_./=:,+@%-]*$/;

/**
 * A script line with its positional parameters (`$0`, `$1`..`$9`, `$*`,
 * `$@`, `$#`) replaced by the values it was run with, outside single quotes,
 * and `$(dirname "$0")` by the script's directory. A parameter whose value is
 * not a plain word is left as it is (the line then reads as unknown).
 */
function bindParams(line: string, script: string, params: readonly string[] | null): string {
  const dir = path.dirname(script);
  const l = line.replace(
    /\$\(dirname\s+(?:"\$0"|\$0|"\$\{0\}")\)/g,
    PLAIN_WORD.test(dir) ? dir : '$(dirname "$0")',
  );
  if (!params || !params.every((x) => PLAIN_WORD.test(x)) || !PLAIN_WORD.test(script)) {
    return l;
  }
  let out = "";
  let single = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (ch === "'") {
      single = !single;
      out += ch;
      continue;
    }
    if (!single && ch === "\\") {
      out += ch + (l[i + 1] ?? "");
      i++;
      continue;
    }
    if (!single && ch === "$") {
      const m = /^\$(?:\{([0-9]|[*@#])\}|([0-9]|[*@#]))/.exec(l.slice(i));
      if (m) {
        const k = m[1] ?? m[2];
        out +=
          k === "0"
            ? script
            : k === "#"
              ? String(params.length)
              : k === "*" || k === "@"
                ? params.join(" ")
                : (params[Number(k) - 1] ?? "");
        i += m[0].length - 1;
        continue;
      }
    }
    out += ch;
  }
  return out;
}

/** A case pattern (quoted parts literal, `*`, `?` outside quotes) as a regular expression; null when not evaluated here. */
function casePatternRegExp(pat: string): RegExp | null {
  let re = "";
  let q: string | null = null;
  for (let i = 0; i < pat.length; i++) {
    const ch = pat[i];
    if (q) {
      if (ch === q) {
        q = null;
      } else {
        re += ch.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
      }
    } else if (ch === '"' || ch === "'") {
      q = ch;
    } else if (ch === "*") {
      re += "[\\s\\S]*";
    } else if (ch === "?") {
      re += "[\\s\\S]";
    } else if (ch === "$" || ch === "`" || ch === "[" || ch === "\\") {
      return null;
    } else {
      re += ch.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    }
  }
  return q ? null : new RegExp(`^${re}$`);
}

/** A case subject's value: a quoted or plain word with no expansion left, or null (unknown). */
function caseWord(w: string): string | null {
  const m = /^"([^"$`\\]*)"$|^'([^']*)'$|^([^\s"'$`\\]+)$/.exec(w.trim());
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
}

/**
 * The branches of a `case WORD in ... esac` (its lines) that can run: the
 * first whose pattern matches a known WORD, every branch when WORD is unknown
 * or a pattern cannot be evaluated. Each branch: the command text it runs.
 */
function caseBranches(subject: string, body: readonly string[]): string[] {
  const branches: { pats: string[]; cmds: string[] }[] = [];
  let cur: { pats: string[]; cmds: string[] } | null = null;
  for (const raw of body) {
    let l = raw.trim();
    if (l === "" || l.startsWith("#")) {
      continue;
    }
    if (!cur) {
      const m =
        /^\(?((?:"[^"]*"|'[^']*'|[^)\s"'])+(?:\s*\|\s*(?:"[^"]*"|'[^']*'|[^)\s"'])+)*)\)\s*(.*)$/.exec(
          l,
        );
      if (!m) {
        no("a case branch Enclawed does not read");
      }
      cur = { pats: m[1].split(/\s*\|\s*/), cmds: [] };
      branches.push(cur);
      l = m[2];
    }
    const end = /;;\s*$/.test(l);
    const cmd = l.replace(/;;\s*$/, "").trim();
    if (cmd) {
      cur.cmds.push(cmd);
    }
    if (end) {
      cur = null;
    }
  }
  const word = caseWord(subject);
  if (word !== null) {
    for (const b of branches) {
      const res = b.pats.map(casePatternRegExp);
      if (res.some((r) => r === null)) {
        break; // cannot tell which branch runs: every branch
      }
      if (res.some((r) => r?.test(word))) {
        return [b.cmds.join("\n")];
      }
    }
    if (branches.every((b) => b.pats.every((x) => casePatternRegExp(x) !== null))) {
      return [];
    }
  }
  return branches.map((b) => b.cmds.join("\n"));
}

/**
 * A shell script: every line read again by these rules, with the parameters
 * it was run with (`params`; null when unknown) bound; a `case` runs only the
 * branch its known subject selects. A line outside the grammar is not contained.
 */
function scanShellScript(
  scan: Scan,
  file: string,
  cwd: string,
  depth: number,
  params: readonly string[] | null = null,
): void {
  const { real, text } = readCode(scan, file);
  const what = path.relative(scan.ctx.projectDir, real);
  if (DEV_NET.test(text)) {
    no(`${what} opens a network connection`);
  }
  const lines = text.replace(/^#!.*\n/, "").split(/\r?\n/);
  let dir = cwd;
  const run = (raw: string) => {
    const line = arithmeticRead(scan, raw, dir, depth);
    const p = parseCompound(line, { cwd: dir, home: scan.ctx.home });
    if (!p.ok) {
      no(`${what} holds a line Enclawed does not read (${p.code})`);
    }
    checkCommands(scan, p.commands, depth + 1);
    // A `cd` to a directory that exists moves the rest of the script there.
    for (const c of p.commands) {
      if (c.argv[0] === "cd" && c.argv.length === 2) {
        const to = path.resolve(c.cwd, c.argv[1]);
        try {
          if (fs.statSync(to).isDirectory()) {
            dir = to;
          }
        } catch {
          /* cd fails: the shell stays */
        }
      }
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const l = bindParams(lines[i].trim(), real, params);
    if (l === "" || l.startsWith("#")) {
      continue;
    }
    const head = /^case\s+(.+?)\s+in$/.exec(l);
    if (head) {
      const body: string[] = [];
      let j = i + 1;
      for (; j < lines.length && lines[j].trim() !== "esac"; j++) {
        body.push(bindParams(lines[j], real, params));
      }
      if (j >= lines.length) {
        no(`${what} holds a case with no esac`);
      }
      for (const branch of caseBranches(head[1], body)) {
        for (const bl of branch.split("\n")) {
          run(bl);
        }
      }
      i = j;
      continue;
    }
    run(l);
  }
}

/** A file run directly: by its shebang. */
function scanExecutable(
  scan: Scan,
  file: string,
  cwd: string,
  depth: number,
  params: readonly string[] | null = null,
): void {
  const { real, text } = readCode(scan, file);
  scan.executed.add(real);
  const bang = /^#!\s*(\S+)(?:\s+(\S+))?/.exec(text)?.[0] ?? "";
  const interp = path.basename(
    bang.replace(/^#!\s*/, "").split(/\s+/)[0] === "/usr/bin/env"
      ? (bang.split(/\s+/)[1] ?? "")
      : bang.replace(/^#!\s*/, "").split(/\s+/)[0],
  );
  if (/^(sh|bash|dash)$/.test(interp)) {
    scanShellScript(scan, real, cwd, depth, params);
  } else if (/^node$/.test(interp)) {
    scanJs(scan, real);
  } else if (/^python3?$/.test(interp)) {
    scanPython(scan, real);
  } else {
    no(
      `it runs ${path.relative(scan.ctx.projectDir, real)}, whose interpreter Enclawed does not read`,
    );
  }
}

// ─── Runners ────────────────────────────────────────────────────────────

/** Node's default test files under `dir` (node --test with no file). */
function nodeTestFiles(dir: string): string[] {
  const out: string[] = [];
  const pat = /(?:^|[.\-_])test\.[cm]?js$|^test[-_].*\.[cm]?js$|^test\.[cm]?js$/;
  const walk = (d: string, underTest: boolean, depth: number) => {
    if (depth > 12 || out.length > MAX_FILES) {
      return;
    }
    let ents: fs.Dirent[] = [];
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (e.name === "node_modules" || e.name === ".git") {
        continue;
      }
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        walk(p, underTest || e.name === "test", depth + 1);
      } else if (e.isFile() && /\.[cm]?js$/.test(e.name) && (underTest || pat.test(e.name))) {
        out.push(p);
      }
    }
  };
  walk(dir, false, 0);
  return out;
}

const NODE_FLAGS = new Set([
  "--test",
  "--test-only",
  "--test-force-exit",
  "--no-warnings",
  "--enable-source-maps",
  "--trace-warnings",
  "--experimental-test-coverage",
  "--check",
  "-c",
]);
const NODE_VALUE_FLAGS = new Set([
  "--test-reporter",
  "--test-name-pattern",
  "--test-skip-pattern",
  "--test-concurrency",
  "--test-timeout",
  "--input-type",
]);

function checkNode(scan: Scan, args: readonly string[], cwd: string): void {
  let test = false;
  let check = false;
  const pos: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (pos.length && !test) {
      // Arguments to the script itself.
      break;
    }
    if (a === "-e" || a === "--eval" || a === "-p" || a === "--print") {
      const code = args[i + 1];
      if (code === undefined) {
        no("node -e without code");
      }
      checkJs(code, "the inline code", cwd);
      checkPaths(code, scan.ctx.projectDir, "the inline code");
      checkSecretLiterals(scan, code, "the inline code");
      literalWrites(scan, code, "js", cwd);
      for (const rel of jsImports(code)) {
        scanJs(scan, path.resolve(cwd, rel));
      }
      return;
    }
    if (a.startsWith("-")) {
      const name = a.split("=")[0];
      if (NODE_FLAGS.has(name)) {
        test ||= name === "--test";
        check ||= name === "--check" || name === "-c";
      } else if (NODE_VALUE_FLAGS.has(name)) {
        if (!a.includes("=")) {
          i++;
        }
      } else {
        no(`node ${name} is not an option Enclawed reads (it may load other code or write files)`);
      }
      continue;
    }
    pos.push(a);
  }
  if (check) {
    // Syntax check only: nothing runs.
    return;
  }
  if (test) {
    const targets = pos.length ? pos : ["."];
    for (const t of targets) {
      const abs = path.resolve(cwd, t);
      if (/[*?[]/.test(t)) {
        const files = expandGlob(cwd, t);
        if (files.length === 1 && files[0] === t) {
          continue; // no match: node reports it, nothing runs
        }
        for (const f of files) {
          if (!isInside(scan.ctx.projectDir, scan.ctx.fs.realpathNearest(path.resolve(cwd, f)))) {
            no(`its tests are outside the project (${f})`);
          }
          scanJs(scan, path.resolve(cwd, f));
        }
        continue;
      }
      let dir = false;
      try {
        dir = fs.statSync(abs).isDirectory();
      } catch {
        /* missing: node reports it */
      }
      if (!isInside(scan.ctx.projectDir, scan.ctx.fs.realpathNearest(abs))) {
        no(`its tests are outside the project (${abs})`);
      }
      for (const f of dir ? nodeTestFiles(abs) : [abs]) {
        scanJs(scan, f);
      }
    }
    return;
  }
  if (pos.length === 0) {
    no("node with no script reads its program from the input");
  }
  scanJs(scan, path.resolve(cwd, pos[0]));
}

const PACKAGE_RUNNERS = new Set(["npm", "pnpm", "yarn", "bun"]);

function checkPackageScript(
  scan: Scan,
  prog: string,
  args: readonly string[],
  cwd: string,
  depth: number,
): void {
  let dir = cwd;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--prefix" || a === "-C" || a === "--dir" || a === "--cwd") {
      dir = path.resolve(cwd, args[++i] ?? "");
    } else if (a.startsWith("--prefix=")) {
      dir = path.resolve(cwd, a.slice("--prefix=".length));
    } else if (["-s", "--silent", "--if-present", "-q", "--quiet"].includes(a)) {
      /* output only */
    } else if (a.startsWith("-")) {
      no(`${prog} ${a} is not an option Enclawed reads`);
    } else {
      rest.push(a);
    }
  }
  let script: string | undefined;
  if ((rest[0] === "list" || rest[0] === "ls") && rest.length === 1) {
    // Lists the installed packages: reads node_modules, runs no script.
    return;
  }
  if (["test", "t", "tst"].includes(rest[0] ?? "")) {
    script = "test";
    if (rest.length > 1) {
      no(`${prog} test with arguments`);
    }
  } else if (rest[0] === "run" || rest[0] === "run-script") {
    script = rest[1];
    if (!script || rest.length > 2) {
      no(`${prog} run needs exactly one script name`);
    }
  } else {
    no(`${prog} ${rest[0] ?? ""} is not a script run Enclawed reads`);
  }
  const pkg = path.join(dir, "package.json");
  if (!isInside(scan.ctx.projectDir, scan.ctx.fs.realpathNearest(pkg))) {
    no(`its package.json is outside the project (${pkg})`);
  }
  if (scan.ctx.overlay?.has(scan.ctx.fs.realpathNearest(pkg))) {
    no("the line changes package.json before it runs a script");
  }
  let scripts: Record<string, unknown> = {};
  try {
    scripts =
      (JSON.parse(fs.readFileSync(pkg, "utf8")) as { scripts?: Record<string, unknown> }).scripts ??
      {};
  } catch {
    // No package.json: the runner fails without running anything.
    return;
  }
  // The script's definition is execution configuration: only git's committed copy is read as code.
  if (!scan.ctx.equalsCommitted(pkg)) {
    no(
      `package.json differs from git's committed copy, so the ${script} script is not the one in history`,
    );
  }
  for (const k of [`pre${script}`, script, `post${script}`]) {
    const text = scripts[k];
    if (typeof text !== "string") {
      continue;
    }
    const p = parseCompound(text, { cwd: dir, home: scan.ctx.home });
    if (!p.ok) {
      no(`the ${k} script is a line Enclawed does not read (${p.code})`);
    }
    checkCommands(scan, p.commands, depth + 1);
  }
}

// ─── Programs that only read or write files ─────────────────────────────

/** Builtins that change nothing (their exit status only). */
const NO_EFFECT = new Set(["exit", "return", "true", "false", ":", "test", "[", "shift", "wait"]);

/**
 * A path outside the project that the containment shows as its own empty
 * place: the person's home (the containment's HOME is a fresh tmpfs) and
 * /tmp (a private tmpfs). What a contained run does there never reaches this
 * machine's files.
 */
function privateInContainment(scan: Scan, p: string): boolean {
  const abs = path.resolve(p);
  if (isInside(scan.ctx.projectDir, scan.ctx.fs.realpathNearest(abs))) {
    return false;
  }
  return isInside("/tmp", abs) || (scan.ctx.home !== null && isInside(scan.ctx.home, abs));
}

/** A file a program reads: inside the project (the view shows nothing else) and holding no secret. */
function readable(scan: Scan, cwd: string, f: string): void {
  const abs = path.resolve(cwd, f);
  const real = scan.ctx.fs.realpathNearest(abs);
  if (!isInside(scan.ctx.projectDir, real)) {
    no(`it reads ${abs}, outside the project`);
  }
  const hit = readReachesCredential(scan.ctx.fs, abs, scan.ctx.home, false);
  if (hit) {
    no(`it reads ${hit.what} (${hit.path})`);
  }
}

/** A file a program creates or changes: inside the project, decided as the equivalent Write/Edit. */
function written(scan: Scan, cwd: string, f: string): void {
  const abs = path.resolve(cwd, f);
  if (!isInside(scan.ctx.projectDir, scan.ctx.fs.realpathNearest(abs))) {
    no(`it writes ${abs}, outside the project`);
  }
  scan.writes.add(abs);
}

/** Options (each must match `ok`) and the operands after them (`--` ends the options). */
function operands(prog: string, args: readonly string[], ok: RegExp): string[] {
  const out: string[] = [];
  let opts = true;
  for (const a of args) {
    if (opts && a === "--") {
      opts = false;
    } else if (opts && a.startsWith("-") && a !== "-") {
      if (!ok.test(a)) {
        no(`${prog} ${a} is not an option Enclawed reads`);
      }
    } else {
      out.push(a);
    }
  }
  return out;
}

/** A reader: prints what its files hold (or about them), writes nothing. */
function reader(ok: RegExp, maxOperands = Infinity) {
  return (scan: Scan, args: readonly string[], cwd: string, prog = "") => {
    const files = operands(prog, args, ok);
    if (files.length > maxOperands) {
      no(`${prog} with ${files.length} operands may write a file`);
    }
    for (const f of files) {
      if (f !== "-") {
        readable(scan, cwd, f);
      }
    }
  };
}

// Shell builtins and reserved words: never "not found".
const SHELL_BUILTINS = new Set(
  "alias bg bind break builtin caller cd command compgen complete compopt continue declare dirs disown echo enable eval exec exit export false fc fg getopts hash help history jobs kill let local logout mapfile popd printf pushd pwd read readarray readonly return set shift shopt source suspend test times trap true type typeset ulimit umask unalias unset wait . : [ [[ ]] { } if then else elif fi case esac for while until do done in function select time coproc".split(
    " ",
  ),
);

/**
 * No program by this name exists: a path that names nothing, or a bare name
 * that is no builtin and is on no directory of PATH (the containment's PATH
 * holds only programs found on this machine's).
 */
function commandNotFound(prog: string, cwd: string): boolean {
  if (prog.includes("/")) {
    try {
      fs.lstatSync(path.resolve(cwd, prog));
      return false;
    } catch {
      return true;
    }
  }
  if (!/^[A-Za-z0-9._+-]+$/.test(prog) || SHELL_BUILTINS.has(prog)) {
    return false;
  }
  for (const d of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!d) {
      return false; // an empty entry is the current directory: not decided here
    }
    try {
      fs.statSync(path.join(d, prog));
      return false;
    } catch {
      /* not here */
    }
  }
  return true;
}

/**
 * A word's file names as the shell expands it: a pattern in its last
 * component (`*`, `?`, `[...]`) matched against that directory (names
 * starting with "." only by a pattern that does); no match leaves the word as
 * it is, as the shell does. A pattern in a directory component: refused.
 */
export function expandGlob(cwd: string, word: string): string[] {
  if (!/[*?[]/.test(word)) {
    return [word];
  }
  const dir = path.dirname(word);
  const base = path.basename(word);
  if (/[*?[]/.test(dir)) {
    no(`a pattern in a directory name (${word.slice(0, 80)})`);
  }
  let re = "";
  for (let i = 0; i < base.length; i++) {
    const ch = base[i];
    if (ch === "*") {
      re += "[^/]*";
    } else if (ch === "?") {
      re += "[^/]";
    } else if (ch === "[") {
      const end = base.indexOf("]", i + 2);
      if (end < 0) {
        re += "\\[";
        continue;
      }
      re += `[${base
        .slice(i + 1, end)
        .replace(/^!/, "^")
        .replace(/\\/g, "\\\\")}]`;
      i = end;
    } else {
      re += ch.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    }
  }
  const rx = new RegExp(`^${re}$`);
  let names: string[] = [];
  try {
    names = fs.readdirSync(path.resolve(cwd, dir));
  } catch {
    return [word];
  }
  const hits = names
    .filter((n) => rx.test(n) && (base.startsWith(".") || !n.startsWith(".")))
    .toSorted()
    .map((n) => (dir === "." && !word.startsWith("./") ? n : path.join(dir, n)));
  if (hits.length > MAX_FILES) {
    no(`a pattern that matches more files than Enclawed reads (${word.slice(0, 80)})`);
  }
  return hits.length ? hits : [word];
}

/** Every regular file and link below a directory (bounded): what `rm -r` deletes. */
function filesBelow(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string, depth: number) => {
    let ents: fs.Dirent[] = [];
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      no(`${d} could not be listed`);
    }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (depth > 12) {
          no("a tree deeper than Enclawed reads");
        }
        walk(p, depth + 1);
      } else {
        out.push(p);
      }
      if (out.length > MAX_FILES) {
        no("a tree with more files than Enclawed reads");
      }
    }
  };
  walk(dir, 0);
  return out;
}

/** awk program text that only computes and prints: no program started, no file written or read by name. */
// A pipe (not `||`) and a `>` inside a print statement are redirections; `>` in a condition is not.
const AWK_EFFECTS =
  /\bsystem\b|\bgetline\b|(?<!\|)\|(?!\|)|\bclose\s*\(|\bfflush\b|\bENVIRON\b|\bPROCINFO\b|@load|@include|\bprintf?\b[^;}\n]*>/;

/**
 * A find whose expression has no action that writes, deletes or runs
 * anything (-delete, -exec*, -ok*, -fprint*, -fls): at most it prints names,
 * or (a word it does not know) it refuses the line and prints nothing. Words
 * GNU find and bfs differ on are then irrelevant.
 */
function findListsOnly(args: readonly string[]): boolean {
  return !args.some((a) =>
    /^-(?:delete|exec|execdir|ok|okdir|fprint|fprint0|fprintf|fls)$/.test(a),
  );
}

/** find predicates Enclawed evaluates for -exec: a conjunction of name, path and type tests. */
function findCandidates(
  scan: Scan,
  args: readonly string[],
  cwd: string,
  needExec = true,
): { files: string[]; exec: string[] } {
  const starts: string[] = [];
  let i = 0;
  for (; i < args.length && !args[i].startsWith("-") && args[i] !== "!" && args[i] !== "("; i++) {
    starts.push(args[i]);
  }
  const tests: ((rel: string, name: string, isDir: boolean) => boolean)[] = [];
  let maxDepth = Infinity;
  let exec: string[] | null = null;
  const globRe = (g: string, ci = false) =>
    new RegExp(
      `^${g
        .replace(/[.+^${}()|\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".")}$`,
      ci ? "i" : "",
    );
  for (; i < args.length; i++) {
    const a = args[i];
    let neg = false;
    let t = a;
    if (t === "!" || t === "-not") {
      neg = true;
      t = args[++i] ?? "";
    }
    let f: ((rel: string, name: string, isDir: boolean) => boolean) | null = null;
    if (/^-(?:i?name|i?path|type|maxdepth)$/.test(t) && args[i + 1] === undefined) {
      return { files: [], exec: [] }; // find refuses the expression and runs nothing
    }
    if (t === "-name" || t === "-iname") {
      const r = globRe(args[++i] ?? "", t === "-iname");
      f = (_rel, name) => r.test(name);
    } else if (t === "-path" || t === "-ipath") {
      const r = globRe(args[++i] ?? "", t === "-ipath");
      f = (rel) => r.test(rel);
    } else if (t === "-type") {
      const ty = args[++i];
      if (ty !== "f" && ty !== "d") {
        no("find -type other than f or d");
      }
      f = (_rel, _name, isDir) => (ty === "d") === isDir;
    } else if (t === "-print" && !neg) {
      continue;
    } else if (t === "-maxdepth" && !neg) {
      maxDepth = Number(args[++i]);
      if (!Number.isInteger(maxDepth)) {
        no("find -maxdepth without a number");
      }
      continue;
    } else if (t === "-exec" && !neg) {
      // The terminator (`;` or `+`) may already be gone from the words (the line's reader takes it).
      const t2 = args.findIndex((x, k) => k > i && (x === ";" || x === "+"));
      const end = t2 < 0 ? args.length : t2;
      if (end < args.length - 1) {
        no("find -exec that is not the last expression");
      }
      exec = args.slice(i + 1, end);
      break;
    } else {
      no(`find ${t} is not a test Enclawed evaluates for -exec`);
    }
    const g = f;
    tests.push(neg ? (r, n, d) => !g(r, n, d) : g);
  }
  if (needExec && (!exec || exec.length === 0 || !exec.includes("{}"))) {
    no("find without one -exec ... {}");
  }
  if (!needExec && exec) {
    no("find -exec feeding another command");
  }
  const files: string[] = [];
  for (const st of starts.length ? starts : ["."]) {
    const root = path.resolve(cwd, st);
    if (!isInside(scan.ctx.projectDir, scan.ctx.fs.realpathNearest(root))) {
      no(`find starts outside the project (${root})`);
    }
    const walk = (d: string, depth: number) => {
      let ents: fs.Dirent[] = [];
      try {
        ents = fs.readdirSync(d, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of ents) {
        const p = path.join(d, e.name);
        const rel = `${st.replace(/\/$/, "")}/${path.relative(root, p)}`;
        if (tests.every((t) => t(rel, e.name, e.isDirectory()))) {
          files.push(rel);
        }
        if (e.isDirectory() && depth + 1 < maxDepth) {
          walk(p, depth + 1);
        }
        if (files.length > 64) {
          no("find -exec over more files than Enclawed reads");
        }
      }
    };
    walk(root, 0);
  }
  return { files, exec: exec ?? [] };
}

const SQL_WRITES =
  /\b(?:insert|update|delete|replace|drop|alter|create|attach|detach|vacuum|reindex|pragma|load_extension|writefile|edit|fts\d?)\b/i;
const SQLITE_DOT =
  /^\.(?:tables|schema|indexes|indices|headers|mode|dbinfo|fullschema|databases|show|width|nullvalue|separator)\b[^;]*$/;

const FILE_PROGRAMS = new Map<string, (scan: Scan, args: readonly string[], cwd: string) => void>([
  ...(
    [
      ["strings", reader(/^-(?:a|-all|[0-9]+|n|t[doxa]?|-bytes=\d+|-radix=[dox])$/)],
      ["od", reader(/^-(?:[AjNtwvbcdiloxsS]\S*|-[a-z-]+(?:=\S+)?)$/)],
      ["file", reader(/^-(?:[bLhikNnrsz]+|-mime(?:-type|-encoding)?|-brief)$/)],
      ["hexdump", reader(/^-(?:[bcCdoxv]+|n\d*|s\d*)$/)],
      ["xxd", reader(/^-(?:[aCEiepuh]+|[clgosn]\d*)$/, 1)],
      ["base64", reader(/^-(?:d|-decode|i|-ignore-garbage|w\d*|-wrap=\d+)$/, 1)],
      ["sha256sum", reader(/^-(?:[bt]|-binary|-text|-tag)$/)],
      ["sha1sum", reader(/^-(?:[bt]|-binary|-text|-tag)$/)],
      ["md5sum", reader(/^-(?:[bt]|-binary|-text|-tag)$/)],
      ["cmp", reader(/^-(?:[blsi]\S*|-silent|-quiet|-verbose)$/, 2)],
      ["zcat", reader(/^-(?:f|-force|q|-quiet)$/)],
    ] as const
  ).map(
    ([n, f]) => [n, (scan: Scan, a: readonly string[], cwd: string) => f(scan, a, cwd, n)] as const,
  ),
  // gzip/pigz only decompressing to standard output (never in place: that replaces the file).
  ...(["gzip", "gunzip", "pigz", "unpigz"] as const).map(
    (n) =>
      [
        n,
        (scan: Scan, args: readonly string[], cwd: string) => {
          const flags = args.filter((a) => a.startsWith("-") && a !== "-").join("");
          if (
            !/c|--stdout|--to-stdout/.test(flags) ||
            !(/d|--decompress/.test(flags) || n.startsWith("gun") || n === "unpigz")
          ) {
            no(`${n} without -dc changes files in place`);
          }
          reader(/^-(?:[cdfqkv]+|-stdout|-to-stdout|-decompress|-force|-quiet|-keep)$/)(
            scan,
            args,
            cwd,
            n,
          );
        },
      ] as const,
  ),
  [
    "openssl",
    (scan, args, cwd) => {
      // openssl zlib -d -in FILE: decompress to standard output.
      if (args[0] !== "zlib" || !args.includes("-d") || args.some((a) => a === "-out")) {
        no("openssl is a program Enclawed reads only as `openssl zlib -d -in FILE`");
      }
      const i = args.indexOf("-in");
      if (i < 0 || args.length !== 4) {
        no("openssl zlib without -in FILE");
      }
      readable(scan, cwd, args[i + 1]);
    },
  ],
  [
    "sqlite3",
    (scan, args, cwd) => {
      // A project database, read: one SQL text of reads only, or display dot-commands.
      const ops = operands(
        "sqlite3",
        args,
        /^-(?:header|noheader|column|csv|json|line|list|box|table|markdown|readonly|batch|bail|echo)$/,
      );
      if (ops.length < 2) {
        no("sqlite3 reads its commands from its input");
      }
      const [db, ...sql] = ops;
      readable(scan, cwd, db);
      for (const q of sql) {
        if (q.trimStart().startsWith(".")) {
          if (!q.split(/\n/).every((l) => l.trim() === "" || SQLITE_DOT.test(l.trim()))) {
            no(`sqlite3 dot-command ${q.slice(0, 40)} is not a display command`);
          }
        } else if (SQL_WRITES.test(q) || !/^\s*(?:select|with|explain)\b/i.test(q)) {
          no("sqlite3 SQL that may change the database or load code");
        }
      }
    },
  ],
  [
    "mkdir",
    (scan, args, cwd) => {
      for (const d of operands("mkdir", args, /^-(?:p|v|pv|vp|-parents|-verbose)$/)) {
        const abs = path.resolve(cwd, d);
        if (privateInContainment(scan, abs)) {
          continue; // the containment's own /tmp or HOME
        }
        if (!isInside(scan.ctx.projectDir, scan.ctx.fs.realpathNearest(abs))) {
          no(`mkdir ${abs}, outside the project`);
        }
        // Only a directory is created (even .git/hooks): an empty directory runs nothing.
      }
    },
  ],
  [
    "touch",
    (scan, args, cwd) => {
      for (const f of operands("touch", args, /^-(?:c|-no-create|a|m)$/)) {
        written(scan, cwd, f);
      }
    },
  ],
  [
    "chmod",
    (scan, args, cwd) => {
      const [mode, ...files] = operands(
        "chmod",
        args,
        /^-(?:v|-verbose|c|-changes|f|-silent|-quiet)$/,
      );
      if (
        !/^(?:[ugoa]*[-+=][rwxX]+(?:,[ugoa]*[-+=][rwxX]+)*|[0-7]{3,4})$/.test(mode ?? "") ||
        files.length === 0
      ) {
        no("chmod with a mode Enclawed does not read");
      }
      for (const f of files) {
        written(scan, cwd, f);
      }
    },
  ],
  [
    "rm",
    (scan, args, cwd) => {
      // What it deletes is decided in ./engine.ts: only files this session created.
      const recursive = args.some((a) => /^-[a-zA-Z]*[rR]|^--recursive$/.test(a));
      for (const t of operands("rm", args, /^-(?:[frRv]+|-force|-recursive|-verbose)$/)) {
        for (const f of expandGlob(cwd, t)) {
          const abs = path.resolve(cwd, f);
          scan.removed.add(abs);
          if (privateInContainment(scan, abs)) {
            continue; // the containment's own /tmp or HOME: nothing of this machine
          }
          // Removing configuration of what runs later (there or not yet): a person decides.
          if (isExecConfigPath(abs) || isExecConfigDir(abs)) {
            no(`rm ${f} removes configuration of what runs later`);
          }
          if (!isInside(scan.ctx.projectDir, scan.ctx.fs.realpathNearest(path.dirname(abs)))) {
            no(`rm ${abs}, outside the project`);
          }
          let st: fs.Stats;
          try {
            st = fs.lstatSync(abs);
          } catch {
            continue; // nothing there: rm deletes nothing
          }
          if (st.isDirectory()) {
            if (recursive) {
              for (const x of filesBelow(abs)) {
                scan.deletes.add(x);
              }
            }
          } else {
            scan.deletes.add(abs);
            // Copied by a command this rm requires (it ran and succeeded first): the copy survives.
            const copy = scan.copies.get(abs);
            const req = scan.line?.[scan.pos]?.requires ?? [];
            if (copy && copy.line === scan.line && req.includes(copy.pos)) {
              scan.backedUp.add(abs);
            }
          }
        }
      }
    },
  ],
  [
    "perl",
    (scan, args, cwd) => {
      // Only the one-liners that decompress what they read with Compress::Zlib:
      // every word of the program from a closed set (read a file or the input,
      // decompress, print), no other module, files read like any read.
      let code: string | null = null;
      const files: string[] = [];
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === "-MCompress::Zlib" || a === "-0777" || a === "-n") {
          continue;
        }
        if (a === "-e" || a === "-ne") {
          if (code !== null) {
            no("perl with more than one -e");
          }
          code = args[++i] ?? "";
          continue;
        }
        if (a.startsWith("-")) {
          no(`perl ${a} is not an option Enclawed reads`);
        }
        files.push(a);
      }
      if (code === null) {
        no("perl reads its program from a file");
      }
      // open F, "<", $ARGV[0] or a literal file (read like any read).
      const opened: string[] = [];
      const rest = code
        .replace(
          /\bopen\s*\(?\s*F\s*,\s*"<"\s*,\s*(?:\$ARGV\[0\]|"([^"$@\\]+)"|'([^'\\]+)')\s*\)?/g,
          (_m, a?: string, b?: string) => {
            if (a ?? b) {
              opened.push(a ?? b ?? "");
            }
            return "";
          },
        )
        .replace(
          /\blocal\s+\$\/|\bbinmode\s+F\b|\bprint\s+uncompress\s*\(\s*(?:<F>|<STDIN>|\$_)\s*\)|\bmy\s+\$\w+\s*=\s*uncompress\s*\(\s*(?:<F>|<STDIN>|\$_)\s*\)|\$\w+\s*=~\s*tr\/(?:[^/\\]|\\.)*\/(?:[^/\\]|\\.)*\/[cdsr]*|\bprint\s+\$\w+/g,
          "",
        )
        .replace(/[\s;]+/g, "");
      if (rest !== "") {
        no("perl code beyond reading and decompressing");
      }
      for (const f of opened) {
        readable(scan, cwd, f);
      }
      for (const f of files) {
        // -n opens its files with perl's two-argument open: "cmd|" would run cmd.
        if (/[|<>&]|^\s|\s$/.test(f)) {
          no(`perl would open ${f.slice(0, 80)} as more than a file`);
        }
        readable(scan, cwd, f);
      }
    },
  ],
  [
    "zlib-flate",
    (_scan, args) => {
      // qpdf's zlib-flate: input to output, nothing else.
      if (args.length !== 1 || !/^-(?:uncompress|compress(?:=\d)?)$/.test(args[0])) {
        no("zlib-flate in a form Enclawed does not read");
      }
    },
  ],
  [
    "tr",
    (_scan, args) => {
      // A filter of its input; it names no file.
      const ops = operands(
        "tr",
        args,
        /^-(?:[cdsCt]+|-delete|-squeeze-repeats|-complement|-truncate-set1)$/,
      );
      if (ops.length < 1 || ops.length > 2) {
        no("tr with an unusual number of sets");
      }
    },
  ],
  [
    "cat",
    (scan, args, cwd) =>
      reader(
        /^-(?:[AbeEnstTuv]+|-show-all|-number|-squeeze-blank|-show-nonprinting|-show-ends|-show-tabs)$/,
      )(scan, args, cwd, "cat"),
  ],
  [
    "awk",
    (scan, args, cwd) => {
      let i = 0;
      for (; i < args.length; i++) {
        const a = args[i];
        if (a === "-F" || a === "-v") {
          i++;
        } else if (/^-F.|^-v./.test(a)) {
          /* -F, / -vNAME=VALUE */
        } else if (a.startsWith("-")) {
          no(`awk ${a} is not an option Enclawed reads`);
        } else {
          break;
        }
      }
      const prog = args[i];
      if (prog === undefined || AWK_EFFECTS.test(prog)) {
        no("awk program that starts programs, reads by name or writes files");
      }
      for (const f of args.slice(i + 1)) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(f)) {
          readable(scan, cwd, f);
        }
      }
    },
  ],
  [
    "sed",
    (scan, args, cwd) => {
      // Not in place (that is decided above): a script that only prints, over files it reads.
      const files = sedReadTargets(args);
      for (const f of files) {
        readable(scan, cwd, f);
      }
    },
  ],
  [
    "find",
    (scan, args, cwd) => {
      if (findListsOnly(args)) {
        return;
      }
      // find ... -exec CMD {} ; : CMD read for each file the tests select now.
      const { files, exec } = findCandidates(scan, args, cwd);
      for (const f of files) {
        const argv = exec.map((x) => (x === "{}" ? f : x));
        checkCommand(
          scan,
          { argv, assigns: [], redirects: [], cwd, cwds: [cwd], piped: false, next: null },
          argv,
          new Set(),
          1,
        );
      }
    },
  ],
  [
    "cp",
    (scan, args, cwd) => {
      // No recursion, no links: plain files copied to a file or into a directory.
      const ops = operands("cp", args, /^-(?:[fpvn]+|-force|-preserve|-verbose|-no-clobber)$/);
      if (ops.length < 2) {
        no("cp needs a source and a target");
      }
      const dest = ops[ops.length - 1];
      const srcs = ops.slice(0, -1);
      let dir = false;
      try {
        dir = fs.statSync(path.resolve(cwd, dest)).isDirectory();
      } catch {
        /* a new file */
      }
      // Several sources: the target must be a directory (made earlier in the line, perhaps);
      // if it is not, cp copies nothing. Either way each copy lands in it.
      if (srcs.length > 1 || dest.endsWith("/")) {
        dir = true;
      }
      for (const src of srcs) {
        readable(scan, cwd, src);
        const to = dir ? path.join(dest, path.basename(src)) : dest;
        written(scan, cwd, to);
        for (const f of expandGlob(cwd, src)) {
          scan.copies.set(path.resolve(cwd, f), {
            dest: path.resolve(cwd, dir ? path.join(dest, path.basename(f)) : dest),
            line: scan.line,
            pos: scan.pos,
          });
        }
      }
    },
  ],
]);

// ─── git, while the repository names nothing git could start ────────────

/** Config keys git only reads as data (no program, no hook, no driver, no pager, no include). */
const INERT_GIT_KEY =
  /^(?:core\.(?:repositoryformatversion|filemode|bare|logallrefupdates|ignorecase|precomposeunicode|symlinks|autocrlf|safecrlf|eol|quotepath|abbrev|compression)|user\.(?:name|email)|init\.defaultbranch|extensions\.\S+|remote\.[^\n]+\.(?:url|fetch|pushurl)|branch\.[^\n]+\.(?:remote|merge|rebase)|color\.\S+|advice\.\S+|gc\.auto|i18n\.\S+)$/;

function gitDirFrom(cwd: string): string | null {
  for (let d = path.resolve(cwd); ; d = path.dirname(d)) {
    const g = path.join(d, ".git");
    try {
      return fs.statSync(g).isDirectory() ? g : null; // a .git file (worktree): not read here
    } catch {
      /* go up */
    }
    if (path.dirname(d) === d) {
      return null;
    }
  }
}

/**
 * Why the repository's configuration could make git start something
 * (a key outside the inert list, a hook in .git/hooks, submodules with their
 * own configuration), or null. `extra`: keys the command never acts on.
 */
function gitStartsSomething(cwd: string, extra: RegExp | null = null, hooks = true): string | null {
  const gitDir = gitDirFrom(cwd);
  if (!gitDir) {
    return "no repository Enclawed reads holds this directory";
  }
  let text: string;
  try {
    text = fs.readFileSync(path.join(gitDir, "config"), "utf8");
  } catch {
    return "the repository's configuration could not be read";
  }
  let section = "";
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    if (l === "" || l.startsWith("#") || l.startsWith(";")) {
      continue;
    }
    const head = /^\[\s*([A-Za-z0-9.-]+)(?:\s+"((?:[^"\\]|\\.)*)")?\s*\]\s*$/.exec(l);
    if (head) {
      section = head[2] !== undefined ? `${head[1]}.${head[2]}` : head[1];
      continue;
    }
    const kv = /^([A-Za-z][A-Za-z0-9-]*)\s*(?:=.*)?$/.exec(l);
    const key = `${section}.${kv?.[1] ?? "?"}`.toLowerCase();
    if (!kv || /\\\s*$/.test(l) || (!INERT_GIT_KEY.test(key) && !(extra && extra.test(key)))) {
      return `its configuration sets ${key}`;
    }
  }
  try {
    const found = hooks
      ? fs.readdirSync(path.join(gitDir, "hooks")).filter((h) => !h.endsWith(".sample"))
      : [];
    if (found.length) {
      return `it holds the hook ${found[0]}`;
    }
  } catch {
    /* no hooks directory */
  }
  if (fs.existsSync(path.join(gitDir, "modules"))) {
    return "it holds submodules with their own configuration";
  }
  return null;
}

/** git's options before the command (git v2.53 usage); a prefix of one is not assumed unknown. */
const GIT_GLOBAL_OPTIONS = [
  "-v",
  "--version",
  "-h",
  "--help",
  "-C",
  "-c",
  "--exec-path",
  "--html-path",
  "--man-path",
  "--info-path",
  "-p",
  "--paginate",
  "-P",
  "--no-pager",
  "--no-replace-objects",
  "--no-lazy-fetch",
  "--no-optional-locks",
  "--no-advice",
  "--bare",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--config-env",
  "--literal-pathspecs",
  "--glob-pathspecs",
  "--noglob-pathspecs",
  "--icase-pathspecs",
  "--super-prefix",
  "--list-cmds",
  "--attr-source",
];

/** The keys (section.sub.key, lower case) the repository's config sets; empty when unreadable. */
function gitConfigKeys(cwd: string): string[] {
  const gitDir = gitDirFrom(cwd);
  let text = "";
  try {
    text = gitDir ? fs.readFileSync(path.join(gitDir, "config"), "utf8") : "";
  } catch {
    return [];
  }
  const out: string[] = [];
  let section = "";
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    const head = /^\[\s*([A-Za-z0-9.-]+)(?:\s+"((?:[^"\\]|\\.)*)")?\s*\]/.exec(l);
    if (head) {
      section = head[2] !== undefined ? `${head[1]}.${head[2]}` : head[1];
      continue;
    }
    const kv = /^([A-Za-z][A-Za-z0-9-]*)\s*(?:=|$)/.exec(l);
    if (kv) {
      out.push(`${section}.${kv[1]}`.toLowerCase());
    }
  }
  return out;
}

function checkGit(scan: Scan, args: readonly string[], cwd: string): void {
  let dir = cwd;
  let i = 0;
  // `-c diff.<driver>.textconv=` / `.command=`: an empty value only switches that driver off.
  const off = new Set<string>();
  let setDriver = false;
  for (; i < args.length; i++) {
    const a = args[i];
    if (a === "-C") {
      dir = path.resolve(dir, args[++i] ?? "");
    } else if (a === "--no-pager" || a === "-P") {
      /* output only */
    } else if (a === "-c" && /^diff\.[^=\s]+\.(?:textconv|command)=/i.test(args[i + 1] ?? "")) {
      const kv = args[++i] ?? "";
      const eq = kv.indexOf("=");
      if (eq === kv.length - 1) {
        off.add(kv.slice(0, eq).toLowerCase());
      } else {
        // A driver set to a program: only a command that never runs drivers may follow.
        setDriver = true;
      }
    } else {
      break;
    }
  }
  if (!isInside(scan.ctx.projectDir, scan.ctx.fs.realpathNearest(dir))) {
    no(`git runs in ${dir}, outside the project`);
  }
  const gd = gitDirFrom(dir);
  if (gd && [...(scan.ctx.overlay?.keys() ?? [])].some((p) => isInside(gd, p))) {
    no("the line changes the repository's git files before git runs");
  }
  const sub = args[i] ?? "";
  // An option git does not know before the command: git prints its usage and runs nothing.
  if (sub.startsWith("-")) {
    const name = sub.split("=")[0];
    if (!GIT_GLOBAL_OPTIONS.some((o) => o.startsWith(name))) {
      return;
    }
  }
  const rest = args.slice(i + 1);
  if (setDriver && sub !== "show") {
    no(`git ${sub} with a diff driver set to a program on its command line`);
  }
  let extra: RegExp | null = null;
  switch (sub) {
    case "add":
      if (rest.some((a) => /^-(?:[a-zA-Z]*[pie]|-patch|-interactive|-edit)$/.test(a))) {
        no("git add that asks interactively");
      }
      for (const f of rest.filter((a) => !a.startsWith("-"))) {
        if (!isInside(scan.ctx.projectDir, scan.ctx.fs.realpathNearest(path.resolve(dir, f)))) {
          no(`git add ${f}, outside the project`);
        }
      }
      break;
    case "commit":
      // A message given (no editor), no signing, no interactive selection.
      if (
        !rest.some((a) =>
          /^(?:-m|-F|-C|--message(?:=.*)?|--file(?:=.*)?|--no-edit|-[a-zA-Z]*[mF]\S*)$/.test(a),
        )
      ) {
        no("git commit without a message starts an editor");
      }
      if (
        rest.some((a) =>
          /^(?:-S\S*|--gpg-sign(?:=.*)?|-e|--edit|-p|--patch|--interactive|--fixup=.*|--squash=.*)$/.test(
            a,
          ),
        )
      ) {
        no("git commit that signs, edits or asks interactively");
      }
      break;
    case "revert":
      if (
        !rest.includes("--no-edit") ||
        rest.some((a) => /^(?:-e|--edit|-S\S*|--gpg-sign.*)$/.test(a))
      ) {
        no("git revert without --no-edit starts an editor");
      }
      break;
    case "config": {
      // Reading the configuration starts nothing; any other form may set a value.
      const opts = rest.filter((a) => a.startsWith("-"));
      const lists = opts.some((a) => a === "--list" || a === "-l");
      const gets = opts.some((a) => /^--get(?:-all|-regexp)?$/.test(a));
      if (
        !opts.every((a) =>
          /^(?:--(?:list|local|show-origin|show-scope|get|get-all|get-regexp|null|name-only|includes|no-includes)|-l|-z)$/.test(
            a,
          ),
        ) ||
        !(lists || gets) ||
        (lists && !gets && rest.length !== opts.length)
      ) {
        no("git config that may set a value");
      }
      return;
    }
    case "clean":
      if (!rest.some((a) => a === "--dry-run" || /^-[a-zA-Z]*n[a-zA-Z]*$/.test(a))) {
        no("git clean deletes what no history holds");
      }
      break;
    case "submodule":
      if (rest[0] !== "status" || rest.length > 2) {
        no(`git submodule ${rest[0] ?? ""} is not a form Enclawed reads`);
      }
      break;
    case "diff":
      if (!rest.includes("--no-index")) {
        no("git diff is decided by the read-only rules");
      }
      for (const f of rest.filter((a) => !a.startsWith("-"))) {
        readable(scan, dir, f);
      }
      break;
    case "diff-tree":
      // Plumbing: no textconv or external diff unless asked for, no working tree, no pager.
      if (rest.some((a) => /^--(?:textconv|ext-diff)$/.test(a) || /%G/.test(a))) {
        no("git diff-tree with --textconv, --ext-diff or a signature format");
      }
      extra = /^diff\.[^\n]+\.(?:textconv|command|binary|cachetextconv|xfuncname|wordregex)$/;
      break;
    case "show":
    case "log": {
      // git show REV:path prints the blob: no diff driver runs without --textconv (measured on git v2.53).
      const blobsOnly =
        sub === "show" &&
        !rest.includes("--textconv") &&
        rest.filter((a) => !a.startsWith("-")).length > 0 &&
        rest.filter((a) => !a.startsWith("-")).every((a) => a.includes(":"));
      if (setDriver && !blobsOnly) {
        no(`git ${sub} with a diff driver set to a program on its command line`);
      }
      // textconv and external diff drivers run only for a patch or a pickaxe
      // search; switched off by --no-textconv / --no-ext-diff or an empty -c.
      const patch =
        sub === "show"
          ? !rest.some((a) => /^(?:-s|--no-patch)$/.test(a))
          : rest.some((a) =>
              /^(?:-p|-u|--patch|--patch-with-stat|-U\d*|--unified.*|--word-diff.*|--color-words.*|-S.*|-G.*|--cc|-c|-m)$/.test(
                a,
              ),
            );
      const keys = gitConfigKeys(dir);
      const textconvOff =
        rest.includes("--no-textconv") ||
        keys.filter((k) => /^diff\..+\.textconv$/.test(k)).every((k) => off.has(k));
      const extOff =
        rest.includes("--no-ext-diff") ||
        keys.filter((k) => /^diff\..+\.command$/.test(k)).every((k) => off.has(k));
      if (rest.some((a) => /^--(?:textconv|ext-diff|show-signature)$|%G/.test(a))) {
        no(`git ${sub} with --textconv, --ext-diff or a signature`);
      }
      if (blobsOnly || !patch || (textconvOff && extOff)) {
        extra = /^diff\.[^\n]+\.(?:textconv|command|binary|cachetextconv|xfuncname|wordregex)$/;
      }
      break;
    }
    default:
      no(`git ${sub} is not a git command Enclawed runs contained`);
  }
  // Hooks run when git writes the index or makes a commit (add, commit, revert); reading commands start none.
  const why = gitStartsSomething(dir, extra, ["add", "commit", "revert"].includes(sub));
  if (why) {
    no(`git ${sub} could start a program the repository names (${why})`);
  }
}

/** One simple command (and whatever it runs), with the names it sets or clears itself. */
function checkCommand(
  scan: Scan,
  c: SimpleCommand,
  argv: readonly string[],
  set: ReadonlySet<string>,
  depth: number,
): void {
  if (depth > MAX_DEPTH) {
    no("it runs commands nested deeper than Enclawed reads");
  }
  for (const cwd of c.cwds) {
    if (
      !isInside(scan.ctx.projectDir, scan.ctx.fs.realpathNearest(cwd)) &&
      !privateInContainment(scan, cwd)
    ) {
      no(`it runs in ${cwd}, outside the project`);
    }
  }
  const cwd = c.cwd;
  scan.cwd = cwd;
  const [prog, ...args] = argv;
  if (prog === "cd" || NO_EFFECT.has(prog)) {
    return;
  }
  if (prog === "set" && args.length > 0 && args.every((a) => /^[-+][euxvo]+$|^pipefail$/.test(a))) {
    return;
  }
  // A read of a credential store or of a file holding a secret: its content would reach the model.
  // Names, metadata and counts show no file's content.
  const countsOnly =
    prog === "wc" &&
    args.every(
      (a) =>
        !a.startsWith("-") || /^-[clwmL]+$|^--(?:bytes|chars|lines|words|max-line-length)$/.test(a),
    );
  // find with no action but listing prints names only.
  const namesOnly = prog === "find" && findListsOnly(args) && !args.includes("-files0-from");
  if (prog !== "ls" && prog !== "stat" && !countsOnly && !namesOnly) {
    const cred = commandReachesCredential(scan.ctx.fs, argv.join(" "), cwd, scan.ctx.home);
    if (cred) {
      no(`it reads ${cred.what} (${cred.path})`);
    }
  }
  if (prog === "env") {
    const names = new Set(set);
    let i = 0;
    for (; i < args.length; i++) {
      const a = args[i];
      if (a === "-u" || a === "--unset") {
        names.add(args[++i] ?? "");
      } else if (a === "-i" || a === "--ignore-environment") {
        for (const n of scan.ctx.repositoryEnv) {
          names.add(n);
        }
      } else if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(a)) {
        const [name, value] = [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)];
        checkAssign(name, value);
        names.add(name);
      } else if (a.startsWith("-")) {
        no(`env ${a} is not an option Enclawed reads`);
      } else {
        break;
      }
    }
    if (i >= args.length) {
      // Contained, it prints the containment's own environment (built from nothing).
      scan.runs = true;
      return;
    }
    checkCommand(scan, c, args.slice(i), names, depth);
    return;
  }
  if (prog === "printenv") {
    scan.runs = true;
    return;
  }
  if (prog === "timeout") {
    let i = 0;
    while (i < args.length && /^-(?:-preserve-status|-foreground|v|-verbose)$/.test(args[i])) {
      i++;
    }
    if (!/^\d+(?:\.\d+)?[smhd]?$/.test(args[i] ?? "") || i + 1 >= args.length) {
      no("timeout is not a form Enclawed reads");
    }
    checkCommand(scan, c, args.slice(i + 1), set, depth);
    return;
  }
  if (
    prog === "sed" &&
    args.some((a) => a === "-i" || a.startsWith("-i") || a.startsWith("--in-place"))
  ) {
    for (const f of sedInPlaceTargets(args).flatMap((t) => expandGlob(cwd, t))) {
      const abs = path.resolve(cwd, f);
      if (!isInside(scan.ctx.projectDir, scan.ctx.fs.realpathNearest(abs))) {
        no(`sed -i edits ${abs}, outside the project`);
      }
      scan.writes.add(abs);
    }
    return;
  }
  const ro = classifyArgv(argv);
  if (ro.readOnly) {
    if (ro.git) {
      const at = argv.indexOf(ro.git.sub);
      const gitCwd = ro.git.cdirs.reduce((acc, d) => path.resolve(acc, d), cwd);
      const gd = gitDirFrom(gitCwd);
      if (gd && [...(scan.ctx.overlay?.keys() ?? [])].some((p) => isInside(gd, p))) {
        no("the line changes the repository's git files before git runs");
      }
      const programs = scan.ctx.fs.gitPrograms?.(gitCwd) ?? null;
      const hit = programs
        ? gitCommandStarts(
            { sub: ro.git.sub, args: argv.slice(at + 1), global: argv.slice(1, at) },
            programs,
          )
        : { kind: "include", line: "the repository's git configuration could not be read" };
      if (hit) {
        no(
          `the repository's git configuration makes git ${ro.git.sub} start a program (${hit.kind})`,
        );
      }
    }
    return;
  }
  scan.runs = true;
  // A runner while the repository's settings set a variable that changes what it runs.
  const unhandled = scan.ctx.repositoryEnv.filter((n) => !set.has(n));
  if (unhandled.length) {
    no(`the repository's settings set ${unhandled.join(", ")}, which changes what ${prog} runs`);
  }
  if (
    [
      "source",
      ".",
      "sh",
      "bash",
      "dash",
      "node",
      "python",
      "python3",
      "perl",
      "awk",
      "sqlite3",
    ].includes(prog) ||
    PACKAGE_RUNNERS.has(prog) ||
    prog.includes("/")
  ) {
    scan.ranCode = true;
  }
  if (prog === "source" || prog === ".") {
    const file = path.resolve(cwd, expandHome(args[0] ?? "", scan.ctx.home));
    // A file of the person's home or of /tmp outside the project is not in the
    // containment's view (its HOME and /tmp are its own, empty): sourcing it
    // fails and runs nothing.
    if (
      !isInside(scan.ctx.projectDir, scan.ctx.fs.realpathNearest(file)) &&
      privateInContainment(scan, file)
    ) {
      return;
    }
    scanShellScript(scan, file, cwd, depth, args.length > 1 ? args.slice(1) : null);
    return;
  }
  if (prog === "sh" || prog === "bash" || prog === "dash") {
    let i = 0;
    while (i < args.length && /^-[eux]+$/.test(args[i])) {
      i++;
    }
    if (args[i] === "-c") {
      // sh -c TEXT [NAME [ARGS...]]: $0 is NAME, $1... the arguments.
      const text =
        args.length > i + 2
          ? bindParams(args[i + 1] ?? "", args[i + 2], args.slice(i + 3))
          : (args[i + 1] ?? "");
      const p = parseCompound(text, { cwd, home: scan.ctx.home });
      if (!p.ok) {
        no(`${prog} -c runs a line Enclawed does not read (${p.code})`);
      }
      checkCommands(scan, p.commands, depth + 1);
      return;
    }
    if (args[i] === undefined || args[i].startsWith("-")) {
      no(`${prog} ${args[i] ?? ""} reads its commands from somewhere Enclawed does not`);
    }
    scanShellScript(scan, path.resolve(cwd, args[i]), cwd, depth, args.slice(i + 1));
    return;
  }
  if (prog === "node") {
    checkNode(scan, args, cwd);
    return;
  }
  if (prog === "python" || prog === "python3") {
    checkPython(scan, args, cwd);
    return;
  }
  if (PACKAGE_RUNNERS.has(prog)) {
    checkPackageScript(scan, prog, args, cwd, depth);
    return;
  }
  if (prog.includes("/")) {
    const abs = path.resolve(cwd, prog);
    if (!scan.mayCreate && commandNotFound(prog, cwd)) {
      return; // no such file: the shell runs nothing
    }
    if (isInside(scan.ctx.projectDir, scan.ctx.fs.realpathNearest(abs))) {
      scanExecutable(scan, abs, cwd, depth, args);
      return;
    }
  }
  if (prog === "git") {
    checkGit(scan, args, cwd);
    return;
  }
  if (FILE_PROGRAMS.has(prog)) {
    FILE_PROGRAMS.get(prog)?.(scan, args, cwd);
    return;
  }
  // No such program: the shell reports "command not found" and runs nothing,
  // unless something earlier in the line may have created it.
  if (!scan.mayCreate && commandNotFound(prog, cwd)) {
    return;
  }
  no(`${prog} is not a program Enclawed reads`);
}

/** NAME=VALUE in front of a command: it may not change what commands run, except to empty it. */
function checkAssign(name: string, value: string): void {
  // GIT_CONFIG_NOSYSTEM only drops the system configuration: git then starts less, never more.
  if (name === "GIT_CONFIG_NOSYSTEM") {
    return;
  }
  if (value !== "" && changesShellCommands(name, ["CLAUDE_CODE_", "ANTHROPIC_"])) {
    no(`it sets ${name}, which changes what commands run`);
  }
}

/**
 * `find ... | xargs CMD`: CMD read once for each file the find selects now
 * (names with blanks or quotes, which xargs would split, are not read).
 */
function checkXargs(scan: Scan, prev: SimpleCommand | null, c: SimpleCommand, depth: number): void {
  if (!prev || !c.piped || prev.argv[0] !== "find") {
    no("xargs takes its arguments from input Enclawed does not read");
  }
  let i = 1;
  while (i < c.argv.length && /^(?:-r|--no-run-if-empty)$/.test(c.argv[i])) {
    i++;
  }
  const cmd = c.argv.slice(i);
  if (cmd.length === 0 || cmd[0].startsWith("-")) {
    no("xargs with options Enclawed does not read");
  }
  const { files } = findCandidates(scan, prev.argv.slice(1), prev.cwd, false);
  for (const f of files) {
    if (/[\s'"\\]/.test(f)) {
      no(`xargs would split the name ${f.slice(0, 80)}`);
    }
    const argv = [...cmd, f];
    checkCommand(scan, { ...c, argv }, argv, new Set(), depth);
  }
}

/** Programs that read code from their input. */
const CODE_FROM_INPUT = new Set([
  "sh",
  "bash",
  "dash",
  "zsh",
  "ksh",
  "node",
  "python",
  "python3",
  "perl",
  "ruby",
  "php",
  "lua",
  "sqlite3",
  "source",
  ".",
  "eval",
  "xargs",
  "env",
  "sudo",
]);

/** A `cd DIR` that fails: DIR is not an existing directory. */
function cdFails(c: SimpleCommand): boolean {
  if (c.argv[0] !== "cd" || c.argv.length !== 2) {
    return false;
  }
  try {
    return !fs.statSync(path.resolve(c.cwd, c.argv[1])).isDirectory();
  } catch {
    return true;
  }
}

function checkCommands(scan: Scan, commands: readonly SimpleCommand[], depth: number): void {
  let prev: SimpleCommand | null = null;
  // After a `cd` that fails, the rest of its `&&` chain (pipelines in it
  // included) never runs; the shell resumes after `;`, `||` or the line's end.
  let skipping = false;
  // Where a failed `cd` would have gone, and where the shell stayed: later
  // commands the reader placed in the first run in the second.
  const failed: { to: string; from: string }[] = [];
  const outer = { line: scan.line, pos: scan.pos };
  scan.line = commands;
  for (let idx = 0; idx < commands.length; idx++) {
    scan.line = commands;
    scan.pos = idx;
    let c = commands[idx];
    if (failed.length) {
      // Each failed `cd` moves the directories it named back to where the shell stayed.
      let cwd = c.cwd;
      let cwds = c.cwds;
      for (const f of failed) {
        const move = (d: string) =>
          isInside(f.to, d) ? path.join(f.from, path.relative(f.to, d)) : d;
        cwd = move(cwd);
        cwds = [...new Set(cwds.map(move))];
      }
      c = { ...c, cwd, cwds };
    }
    const before = prev;
    prev = c;
    if (skipping && (before?.next === "&&" || before?.next === "|")) {
      continue;
    }
    skipping = false;
    if (cdFails(c)) {
      skipping = c.next === "&&";
      failed.push({ to: path.resolve(c.cwd, c.argv[1]), from: c.cwd });
      continue;
    }
    if (c.argv[0] === "xargs") {
      checkXargs(scan, before, c, depth);
      continue;
    }
    for (const a of c.assigns) {
      checkAssign(a.name, a.value);
    }
    const set = new Set(c.assigns.map((a) => a.name));
    // `export NAME=VALUE` in a list sets it for what follows (a sourced env file uses it).
    if (c.argv[0] === "export") {
      for (const a of c.argv.slice(1)) {
        const eq = a.indexOf("=");
        if (eq <= 0) {
          no("export without a value");
        }
        checkAssign(a.slice(0, eq), a.slice(eq + 1));
      }
      continue;
    }
    // A file fed as input (`< FILE`): data for a reader, the program of a runner.
    for (const r of c.reads ?? []) {
      if (CODE_FROM_INPUT.has(path.basename(c.argv[0] ?? ""))) {
        no(`${c.argv[0]} would run what ${r} holds`);
      }
      readable(scan, c.cwd, r);
    }
    checkCommand(scan, c, c.argv, set, depth);
    if (scan.runs || scan.writes.size || scan.deletes.size || c.writes?.length) {
      scan.mayCreate = true;
    }
  }
  scan.line = outer.line;
  scan.pos = outer.pos;
}

/**
 * Whether the copy a cp of this line made of `f` may be gone or changed when
 * the line ends: the line deletes it (or a directory holding it), or writes
 * it again, or writes `f` itself after... (any other write to `f`).
 */
function copyLost(scan: Scan, f: string): boolean {
  const copy = scan.copies.get(f);
  if (!copy || scan.ranCode) {
    return true;
  }
  if ([...scan.deletes, ...scan.removed].some((d) => d === copy.dest || isInside(d, copy.dest))) {
    return true;
  }
  if (!isInside(scan.ctx.projectDir, copy.dest)) {
    return true; // the containment's own /tmp or HOME: gone with it
  }
  // f written by the line (sed -i, >, a copy onto it): the copy may not match what is deleted.
  return [...scan.writes].some((w) => path.resolve(w) === f);
}

/**
 * Can this command line run contained, with nothing a person must decide?
 * `commands`: the line as ./shell-compound.ts read it.
 */
export function containedExecution(
  ctx: ContainedContext,
  commands: readonly SimpleCommand[],
): ContainedVerdict {
  const scan: Scan = {
    ctx,
    files: new Set(),
    executed: new Set(),
    writes: new Set(),
    runs: false,
    cwd: ctx.projectDir,
    deletes: new Set(),
    mayCreate: false,
    line: null,
    pos: 0,
    copies: new Map(),
    backedUp: new Set(),
    ranCode: false,
    removed: new Set(),
  };
  try {
    checkCommands(scan, commands, 0);
  } catch (err) {
    if (err instanceof NotContained) {
      return { ok: false, why: err.message };
    }
    return { ok: false, why: `it could not be read (${(err as Error)?.message ?? err})` };
  }
  return {
    ok: true,
    files: [...scan.files].toSorted(),
    executed: [...scan.executed].toSorted(),
    writes: [...scan.writes].toSorted(),
    runs: scan.runs,
    deletes: [...scan.deletes].toSorted(),
    backedUp: [...scan.backedUp].filter((f) => !copyLost(scan, f)).toSorted(),
    copies: [...scan.copies].map(([source, c]) => ({ source, dest: c.dest })),
  };
}

// ─── sed -i: an in-place edit ───────────────────────────────────────────

/**
 * The files `sed -i` edits, when its script only edits text: s///
 * (flags g, p, i, I, m, M, a number; never e, which runs the pattern space
 * as a command, or w, which writes another file), y///, a/i/c text, d, p,
 * =, q, with line, $ and /regex/ addresses. Anything else (r/R/w/W/e
 * commands, braces, labels, a script file) is not read.
 */
/** The files a sed that only prints reads (its script read like an in-place one's; none: its input). */
function sedReadTargets(args: readonly string[]): string[] {
  return sedInPlaceTargets([...args, "/dev/null"]).slice(0, -1);
}

export function sedInPlaceTargets(args: readonly string[]): string[] {
  const scripts: string[] = [];
  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-e" || a === "--expression") {
      scripts.push(args[++i] ?? "");
    } else if (a.startsWith("--expression=")) {
      scripts.push(a.slice(13));
    } else if (
      a === "-f" ||
      a.startsWith("--file") ||
      (a.startsWith("-") && !a.startsWith("--") && a.includes("f"))
    ) {
      no("sed reads its script from a file");
    } else if (
      /^-[Ernsuz]*i[^/\s]*$/.test(a) ||
      /^-[Ernsuz]+$/.test(a) ||
      /^--(in-place(=.*)?|regexp-extended|quiet|silent|separate|null-data|posix|debug)$/.test(a)
    ) {
      /* options that do not change what the script may do */
    } else if (a.startsWith("-")) {
      no(`sed ${a} is not an option Enclawed reads`);
    } else if (scripts.length === 0) {
      scripts.push(a);
    } else {
      files.push(a);
    }
  }
  if (files.length === 0) {
    no("sed -i with no file");
  }
  for (const s of scripts) {
    checkSedScript(s);
  }
  return files;
}

function checkSedScript(script: string): void {
  let i = 0;
  const n = script.length;
  const skipWs = () => {
    while (i < n && /[\s;]/.test(script[i])) {
      i++;
    }
  };
  /** A delimited part (s, y, /regex/), escapes honored; returns after the closing delimiter. */
  const delimited = (d: string) => {
    while (i < n && script[i] !== d) {
      i += script[i] === "\\" ? 2 : 1;
    }
    if (i >= n) {
      no("sed script with an unterminated part");
    }
    i++;
  };
  const address = () => {
    if (script[i] === "$") {
      i++;
    } else if (/\d/.test(script[i] ?? "")) {
      while (/\d/.test(script[i] ?? "")) {
        i++;
      }
    } else if (script[i] === "/") {
      i++;
      delimited("/");
      if (script[i] === "I" || script[i] === "M") {
        i++;
      }
    } else {
      return false;
    }
    return true;
  };
  skipWs();
  while (i < n) {
    if (address() && script[i] === ",") {
      i++;
      if (!address()) {
        no("sed address range without an end");
      }
    }
    while (script[i] === " ") {
      i++;
    }
    const c = script[i++];
    if (c === "s" || c === "y") {
      const d = script[i++];
      if (!d || /[\s\\\n]/.test(d)) {
        no("sed s with an unusual delimiter");
      }
      delimited(d);
      delimited(d);
      if (c === "s") {
        while (i < n && /[gpiImM0-9]/.test(script[i])) {
          i++;
        }
        if (i < n && /[ew]/.test(script[i])) {
          no("sed s with the e or w flag runs a command or writes a file");
        }
      }
    } else if (c === "a" || c === "i" || c === "c") {
      // The text runs to the end of the line (or the script).
      while (i < n && script[i] !== "\n") {
        i++;
      }
    } else if (
      c === "d" ||
      c === "p" ||
      c === "=" ||
      c === "q" ||
      c === "Q" ||
      c === "n" ||
      c === "N" ||
      c === "P" ||
      c === "D"
    ) {
      /* no argument */
    } else {
      no(`sed command ${JSON.stringify(c ?? "")} is not one Enclawed reads`);
    }
    skipWs();
  }
}

// ─── The snapshot before the run ────────────────────────────────────────

/** git's blob id of a content (sha1 repositories). */
export function gitBlobId(content: Buffer): string {
  return createHash("sha1").update(`blob ${content.length}\0`).update(content).digest("hex");
}

/** Directories whose content is regenerated, never the user's data: not snapshotted. */
const REGENERATED = new Set(["node_modules", "__pycache__", ".pytest_cache"]);

export type ProjectSnapshotPlan =
  | Readonly<{ ok: true; files: readonly string[] }>
  | Readonly<{ ok: false; why: string }>;

/**
 * The project files git does not hold as they are now (untracked, ignored,
 * changed): what a contained run could change that only Enclawed's history
 * can put back. `committed`: path (relative, "/"-separated) -> blob id of
 * HEAD's tree. Bounded: a project with more than `maxFiles` such files, or
 * more than `maxBytes` in them, is not snapshotted (the run then asks).
 */
export function projectSnapshotPlan(
  projectDir: string,
  committed: ReadonlyMap<string, string> | null,
  o: Readonly<{ maxFiles: number; maxBytes: number; maxFileBytes: number }>,
): ProjectSnapshotPlan {
  if (!committed) {
    return { ok: false, why: "git's committed tree could not be read" };
  }
  const files: string[] = [];
  let bytes = 0;
  let seen = 0;
  const walk = (dir: string, rel: string): string | null => {
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return `${dir} could not be listed`;
    }
    for (const e of ents) {
      if (++seen > 200_000) {
        return "the project is too large to snapshot";
      }
      const r = rel ? `${rel}/${e.name}` : e.name;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if ((rel === "" && e.name === ".git") || REGENERATED.has(e.name)) {
          continue;
        }
        const w = walk(p, r);
        if (w) {
          return w;
        }
        continue;
      }
      if (!e.isFile()) {
        // A symlink or special file: the run cannot change what it points to (the view), only replace it.
        continue;
      }
      let content: Buffer;
      try {
        const st = fs.statSync(p);
        if (st.size > o.maxFileBytes) {
          return `${r} is larger than Enclawed's history keeps`;
        }
        content = fs.readFileSync(p);
      } catch {
        return `${r} could not be read`;
      }
      if (committed.get(r) === gitBlobId(content)) {
        continue;
      }
      files.push(p);
      bytes += content.length;
      if (files.length > o.maxFiles || bytes > o.maxBytes) {
        return "the project holds more files git does not keep than Enclawed snapshots for one command";
      }
    }
    return null;
  };
  const why = walk(projectDir, "");
  return why ? { ok: false, why } : { ok: true, files };
}
