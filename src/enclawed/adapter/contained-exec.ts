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
import { lookupProgram } from "../containment/plan.js";
import { BUILD_TOOLS, readBuildCommand } from "./contained-build.js";
import { commandReachesCredential, readReachesCredential } from "./credentials.js";
import { changesShellCommands } from "./env-trust.js";
import { expandHome, isInside, type FsProbe } from "./fs-probe.js";
import { gitCommandStarts } from "./git-programs.js";
import {
  gitDirFrom,
  gitRepoStarts,
  hooksRunBy,
  LOCAL_WRITE_SUBS,
  pathspecsOf,
  stagedOnlyRefusal,
  localGitWriteRefusal,
} from "./git-writes.js";
import { containedPythonStatus, readPython } from "./python-reader.js";
import { isExecConfigDir, isExecConfigPath } from "./rule-kit.js";
import { parseCompound, type SimpleCommand } from "./shell-compound.js";
import { classifyArgv } from "./shell-readonly.js";
import type { PythonVenv } from "./types.js";
import { venvFingerprint, type VenvTrustStore } from "./venv-trust.js";
import { dotDotOverLink, resolveViewPath, viewFs, withViewRecord } from "./view-fs.js";

export { resolveViewPath, type ViewPath } from "./view-fs.js";

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
      /** SHA-256 (hex) of each program read from a here-document on a runner's standard input. */
      stdin: readonly string[];
      /** Of `files`, the shell scripts it runs or sources: the contained shell runs the copy read. */
      shell: readonly string[];
      /** Text a shell of the line runs with -c (besides the line itself): the only -c text it may run. */
      shellText: readonly string[];
      /** What a shell of the line reads as data: its real path and content's SHA-256. */
      reads: readonly Readonly<{ path: string; sha256: string }>[];
      /** A git command of the line writes HEAD or refs (switch, checkout, branch): git's history stays writable in the view. */
      gitRefWrites?: true;
      /**
       * The line runs a build tool (./contained-build.ts): it runs as a
       * contained build, code Enclawed did not read included, so no code pin
       * applies; the containment's own protections do (../containment/build-mode.ts).
       */
      build?: Readonly<{
        tools: readonly string[];
        outputs: readonly Readonly<{ dir: string; marker: readonly string[] }>[];
      }>;
      /** A path of the line is in a scratch directory (hostScratch): it runs on the host, never contained. */
      scratch?: true;
      /** It runs a program besides the file programs (code, git, a script). */
      runsCode?: true;
      /** Existing project files whose mode a chmod of the line changes (absolute). */
      modeChanges: readonly string[];
      /** The project virtual environment its Python runs as (ContainedCode.pythonVenv). */
      pythonVenv?: PythonVenv;
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
  /**
   * The line is to run on the host, not contained: the session's scratch
   * directories (history irrelevant there) are within reach of the file
   * programs besides the project, and nothing outside the project is private.
   */
  hostScratch?: readonly string[];
  /**
   * The session's environment (EngineOptions.environment): an activated
   * virtual environment (VIRTUAL_ENV, PATH) decides which Python `python3` is.
   */
  environment?: Readonly<Record<string, string | undefined>> | null;
  /** The virtual environments trusted by content (./venv-trust.ts); none: no environment is. */
  venvTrust?: VenvTrustStore | null;
  /** An environment the line would run as, not (or no longer) trusted: its fingerprint now. */
  onUntrustedVenv?: (dir: string, fingerprint: string) => void;
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
    // Other ways to a module (getBuiltinModule, the module loader, the main
    // module's require) and to the stack and prototypes the guard relies on.
    /\bgetBuiltinModule\b|\b_load\b|\bmainModule\b|\brequire\s*\.\s*(?:main|cache|resolve)\b|\bmodule\s*\.\s*(?:constructor|parent|children|require)\b|\b_linkedBinding\b|\bprocess\s*\.\s*(?:binding|execve)\b|\bprepareStackTrace\b|\bcaptureStackTrace\b|__proto__|\bsetPrototypeOf\b|\b(?:Object|Array|Function|String|Number|Boolean|Error|RegExp|Promise|Map|Set|Symbol|Buffer)\s*\.\s*prototype\b/,
    "reaches modules, the stack or built-in prototypes by another way",
  ],
  [
    /\bprocess\.kill\b|\bprocess\.setuid\b|\bprocess\.chdir\s*\(\s*['"`]\//,
    "acts on other processes or the system",
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
  /** Files a shell of the line reads as data (its `<` inputs): real path -> SHA-256 of what it reads. */
  dataReads: Map<string, string>;
  /** The shell that runs the text being read: dash (sh, the contained line, package scripts) or bash. */
  dialect: "dash" | "bash";
  /** The command list being read and the position in it (for `requires`, ./shell-compound.ts). */
  line: readonly SimpleCommand[] | null;
  pos: number;
  /** Files a cp of this line copied: source -> where its copy lands, and which command copied it. */
  copies: Map<string, { dest: string; line: readonly SimpleCommand[] | null; pos: number }>;
  /** Files the line deletes only after a command it requires copied them (their copy survives). */
  backedUp: Set<string>;
  /** Whether the line runs code (a script, a runner): it could change any project file between commands. */
  ranCode: boolean;
  /** Whether a git command of the line writes HEAD or refs (switch, checkout, branch). */
  gitRefWrites: boolean;
  /** Every path an rm of the line names (there now or not: the line may create it first). */
  removed: Set<string>;
  byName?: Map<string, string[]>;
  /** SHA-256 (hex) of each program a runner reads from a here-document on its standard input. */
  stdin: Set<string>;
  /** Whether a command already read may have changed project files (it runs code, writes, deletes or copies). */
  changedFiles: boolean;
  /** Shell scripts the line runs or sources (real paths): the contained shell runs only the copy read. */
  shell: Set<string>;
  /** Text a shell runs with -c (`sh -c TEXT`, a package script's line): the contained shell runs only these. */
  shellText: Set<string>;
  /** While a package script's line is read: the node_modules/.bin directories its runner puts first on PATH. */
  binDirs?: readonly string[] | null;
  /** Build tools the line runs (./contained-build.ts), with their output directories. */
  buildTools: Set<string>;
  buildOutputs: { dir: string; marker: readonly string[] }[];
  /** Whether a git command of the line goes beyond the read-only allowlist (git add, commit, config, ...). */
  gitBeyondReadOnly: boolean;
  /**
   * Absolute paths outside the project that a read-only command of the line
   * names (`ls /usr/include/x.h`): the containment's view may not show them,
   * and the command would then answer differently than on the host.
   */
  systemReads: string[];
  /** A path of the line is in a scratch directory (ContainedContext.hostScratch). */
  scratchTouched?: boolean;
  /** Existing project files whose mode a chmod of the line changes. */
  modeChanges: Set<string>;
  /** The line runs a program that is not one of the file programs (FILE_PROGRAMS): code, git, a script. */
  runsCode?: boolean;
  /** The project virtual environment its Python runs as. */
  pythonVenv?: PythonVenv;
  /** A pytest run of the line: test code may import pytest, the runner itself. */
  pytestRun?: boolean;
  /** The Python the line's runners are: "" the toolchain's, else an environment's directory. */
  pythonKind?: string;
};

function readCode(scan: Scan, file: string): { real: string; text: string } {
  const real = scan.ctx.fs.realpathNearest(file);
  if (!isInside(scan.ctx.projectDir, real)) {
    no(`it runs ${real}, which is outside the project`);
  }
  let st: fs.Stats;
  try {
    st = viewFs.statSync(real);
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
  return { real, text: later ?? viewFs.readText(real) };
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
      ents = viewFs.readdirEntries(d);
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
        return viewFs.statSync(c).isFile();
      } catch {
        return false;
      }
    });
    if (found && !scan.files.has(scan.ctx.fs.realpathNearest(found))) {
      scanJs(scan, found, depth + 1);
    }
  }
}

/**
 * JavaScript text with its comments and the contents of its quoted strings
 * blanked (an approximation: what is left is the code's own words).
 */
function jsWithoutCommentsAndStrings(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];
    if (c === "/" && n === "/") {
      const e = text.indexOf("\n", i);
      i = e < 0 ? text.length : e;
      continue;
    }
    if (c === "/" && n === "*") {
      const e = text.indexOf("*/", i + 2);
      i = e < 0 ? text.length : e + 2;
      out += " ";
      continue;
    }
    // Quoted strings only: a template literal's ${...} is code, so it stays.
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== c) {
        j += text[j] === "\\" ? 2 : 1;
      }
      out += `${c}${c}`;
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
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
  // require, module and import.meta only in their plain forms: require called
  // directly (with one literal name, above), module.exports, and
  // import.meta.url/dirname/filename. Never as a value (`const r = require`,
  // an argument, a property, destructured), which no reading here could follow.
  const code = jsWithoutCommentsAndStrings(text);
  if (
    /\brequire\b(?!\s*\()/.test(code) ||
    /(?<![.\w$])module\b(?!\s*\.\s*exports\b)/.test(code) ||
    /\bimport\s*\.\s*meta\b(?!\s*\.\s*(?:url|dirname|filename)\b)/.test(code)
  ) {
    no(`${what} uses require, module or import.meta other than in their plain forms`);
  }
  // Nor through the CommonJS wrapper: `arguments` at module scope is the
  // wrapper's (exports, require, module, ...), and a function's caller or
  // callee leads back to it. Nor node's own module hooks and compile cache.
  if (/\barguments\b|\.\s*(?:caller|callee)\b/.test(code)) {
    no(`${what} uses arguments, caller or callee (a way to require and module as values)`);
  }
  if (
    /\.\s*register(?:Hooks)?\b|\b(?:registerHooks|enableCompileCache|syncBuiltinESMExports)\b/.test(
      code,
    )
  ) {
    no(`${what} registers module hooks or changes how node loads code`);
  }
  // WebAssembly compiles bytes into code; the node guard refuses it too.
  if (/\bWebAssembly\b/.test(code)) {
    no(`${what} compiles WebAssembly, code Enclawed does not read`);
  }
  // node:test's run() starts node children with options the code chooses
  // (execArgv, argv, env, cwd, ...): node --test runs the test files instead.
  if (
    /\bexecArgv\b/.test(code) ||
    (/(?:\brequire\s*\(\s*|\bfrom\s*|\bimport\s*\(\s*)(['"])(?:node:)?test\1/.test(text) &&
      /\brun\b/.test(code))
  ) {
    no(`${what} runs tests with node:test's run(), which chooses how node children start`);
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
  checkJsLinks(text, code, what);
  checkText(text, JS_EFFECTS, what);
}

/**
 * Links a JS program makes: each one a call with a literal relative target
 * with no `..` (beside the link, in a place the run may write). A computed target, another way to the call (an alias, a computed member
 * of fs) or a copy that keeps link targets as written is refused.
 */
function checkJsLinks(text: string, code: string, what: string): void {
  if (/\bverbatimSymlinks\b|\b(?:fs|fsp|promises|fsPromises)\s*\[/.test(code)) {
    no(`${what} copies links as written or reaches fs by a computed name`);
  }
  const uses = [
    ...code.matchAll(
      /\b(?:symlink|symlinkSync|linkSync)\b|\blink\s*\(|\b(?:fs|promises)\s*\.\s*link\b/g,
    ),
  ].length;
  if (uses === 0) {
    return;
  }
  let calls = 0;
  for (const m of text.matchAll(
    /\b(?:symlink|symlinkSync|link|linkSync)\s*\(\s*(['"])([^'"\\\n]*)\1/g,
  )) {
    calls++;
    const t = m[2];
    // Relative to where the link is made (a place the run may write), never up.
    const inside = !t.startsWith("/") && t !== "" && !t.split("/").includes("..");
    if (!inside) {
      no(`${what} makes a link to ${t.slice(0, 80)}, outside the project`);
    }
  }
  if (calls < uses) {
    no(`${what} makes a link whose target is not one literal Enclawed reads`);
  }
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
    if (viewFs.existsSync(path.join(d, "node_modules", name))) {
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
  ].some((g) => viewFs.existsSync(path.join(g, name)));
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

function scanPython(
  scan: Scan,
  file: string,
  dirs: readonly string[] | null = null,
  programArgs: readonly string[] = [],
  interpreter = "python3",
): void {
  const { real, text } = readCode(scan, file);
  checkPythonCode(
    scan,
    text,
    path.relative(scan.ctx.projectDir, real),
    dirs ?? [path.dirname(real)],
    real,
    programArgs,
    interpreter,
  );
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
 * Python code, read by ./python-reader.ts (a parse by the system's python3,
 * never a run): it may only read files, write files and compute, and every
 * project module it imports is read by the same rules (each one pinned
 * through readCode). Each module's text also goes through the checks of
 * every runner here: the paths and secret files it names and the files it
 * writes by a literal name.
 */
function checkPythonCode(
  scan: Scan,
  text: string,
  what: string,
  dirs: readonly string[],
  file: string | null = null,
  programArgs: readonly string[] = [],
  interpreter = "python3",
): void {
  const why = readPython(text, what, file, dirs, {
    programArgs,
    interpreter,
    // The run's virtual environment: its packages are code Enclawed did not read
    // (an import of one from the project is refused), but pytest, the runner of a
    // pytest run, may be imported by its tests.
    ...(scan.pythonVenv ? { siteDirs: [scan.pythonVenv.site] } : {}),
    ...(scan.pytestRun ? { runnerModules: ["pytest", "_pytest"] } : {}),
    load: (f) => readCode(scan, f),
    checkText: (t, w) => {
      checkPaths(t, scan.ctx.projectDir, w);
      checkSecretLiterals(scan, t, w);
      literalWrites(scan, t, "py", scan.cwd);
      // sqlite3: only literal SQL that reads (a change to a database asks a person).
      if (/\bsqlite3\b/.test(t)) {
        checkPySqlite(t, w);
      }
    },
    cwd: scan.cwd,
    show: (f) => path.relative(scan.ctx.projectDir, f),
  });
  if (why) {
    no(why);
  }
}

/** A unittest name (a file path, or a dotted module[.Class[.test]]) whose module is a file of `cwd`'s tree. */
function unittestNameInProject(cwd: string, name: string): boolean {
  if (name.endsWith(".py")) {
    return (
      viewFs.existsSync(path.resolve(cwd, name)) && !path.isAbsolute(name) && !name.includes("..")
    );
  }
  const parts = name.split(".");
  if (!parts.every((p) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(p))) {
    return false;
  }
  for (let n = parts.length; n >= 1; n--) {
    const base = path.join(cwd, ...parts.slice(0, n));
    if (viewFs.existsSync(`${base}.py`) || viewFs.existsSync(path.join(base, "__init__.py"))) {
      return true;
    }
  }
  return false;
}

/** A python interpreter's name in an environment's bin (python, python3, python3.14). */
const VENV_PYTHON = /^python(?:3(?:\.\d+)?)?$/;

/**
 * The project virtual environment at `dir` (a directory holding pyvenv.cfg),
 * as a run of its Python sees it: the toolchain's interpreter its bin/python3
 * leads to (the pyvenv.cfg home), of a version the guard is verified on, and
 * its site-packages. null: `dir` is no virtual environment. Refused (thrown)
 * when it is one a contained run cannot run as.
 */
function projectVenv(scan: Scan, dir: string): (PythonVenv & { interpreter: string }) | null {
  const cfgPath = path.join(dir, "pyvenv.cfg");
  let cfgText: string;
  try {
    if (!viewFs.statSync(cfgPath).isFile()) {
      return null;
    }
    cfgText = viewFs.readBytes(cfgPath).toString("utf8");
  } catch {
    return null;
  }
  const realDir = scan.ctx.fs.realpathNearest(dir);
  if (!isInside(scan.ctx.projectDir, realDir)) {
    no(`the Python environment ${dir} is outside the project`);
  }
  // A contained run changed its installed packages (the mark the containment
  // leaves, ../containment/dependency-changes.ts): not toolchain code any more.
  if (viewFs.existsSync(path.join(realDir, ".enclawed-tainted"))) {
    no(
      `a contained run changed the installed packages of the Python environment ${path.relative(scan.ctx.projectDir, realDir)} (see its .enclawed-tainted); reinstall them, which clears it`,
    );
  }
  // Only .venv and venv: the names whose packages and entry points no contained
  // run writes (../containment/name-guard.ts IMPLICIT_EXEC_CACHES).
  if (![".venv", "venv"].includes(path.basename(realDir))) {
    no(
      `the Python environment ${path.relative(scan.ctx.projectDir, realDir)} is not named .venv or venv, whose packages contained runs never write`,
    );
  }
  const cfg = new Map<string, string>();
  for (const line of cfgText.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_.-]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) {
      cfg.set(m[1].toLowerCase(), m[2]);
    }
  }
  const exe = ["python3", "python"]
    .map((n) => path.join(dir, "bin", n))
    .find((p) => viewFs.existsSync(p));
  const r = exe ? resolveViewPath("/", exe) : null;
  if (!r || r.kind !== "found" || isInside(scan.ctx.projectDir, r.real)) {
    no(
      `the Python environment ${path.relative(scan.ctx.projectDir, realDir)} has no interpreter of the toolchain`,
    );
  }
  // Its interpreter must be the one its pyvenv.cfg names (home): the Python it was made with.
  const home = cfg.get("home");
  // Python finds its standard library from this text: no `.` or `..` component
  // (path.join takes them off without the filesystem; python need not).
  const viaHome =
    home && path.isAbsolute(home) && !home.split("/").some((c) => c === "." || c === "..")
      ? resolveViewPath("/", path.join(home, path.basename(r.real)))
      : null;
  if (!viaHome || viaHome.kind !== "found" || viaHome.real !== r.real) {
    no(
      `the Python environment ${path.relative(scan.ctx.projectDir, realDir)} runs an interpreter other than its pyvenv.cfg home`,
    );
  }
  const st = containedPythonStatus(r.real);
  if (st.unsupported || !st.version) {
    no(st.unsupported ?? "contained Python could not tell the environment's Python version");
  }
  const site = path.join(
    realDir,
    "lib",
    `python${st.version[0]}.${st.version[1]}`,
    "site-packages",
  );
  let siteReal: string;
  try {
    siteReal = viewFs.realpathSync(site);
    if (!viewFs.statSync(siteReal).isDirectory() || !isInside(realDir, siteReal)) {
      throw new Error("not a directory of the environment");
    }
  } catch {
    no(
      `the Python environment ${path.relative(scan.ctx.projectDir, realDir)} has no site-packages for Python ${st.version[0]}.${st.version[1]}`,
    );
  }
  // Trusted by content, never by place: the fingerprint a decided install or a
  // person's approval recorded (./venv-trust.ts), whatever made the environment
  // (the repository may commit one; a write outside a containment may change it).
  const fingerprint = venvFingerprint(realDir);
  const recorded = scan.ctx.venvTrust?.trusted(realDir) ?? null;
  if (fingerprint === null || recorded !== fingerprint) {
    if (fingerprint !== null) {
      scan.ctx.onUntrustedVenv?.(realDir, fingerprint);
    }
    const rel = path.relative(scan.ctx.projectDir, realDir);
    const tracked = scan.ctx.equalsCommitted(path.join(realDir, "pyvenv.cfg"));
    no(
      recorded === null
        ? `the Python environment ${rel} has not been trusted yet${tracked ? " (git tracks it: it came with the repository)" : ""}; approve at Enclawed's prompt to trust its installed packages as they are, or install into it`
        : `the installed packages of the Python environment ${rel} changed since they were last trusted; approve at Enclawed's prompt to trust them as they are now, or reinstall`,
    );
  }
  return {
    dir: realDir,
    site: siteReal,
    systemSite: (cfg.get("include-system-site-packages") ?? "false").toLowerCase() === "true",
    interpreter: r.real,
  };
}

/** The environment a python word (a path) is the interpreter of: <venv>/bin/python*, or null. */
function venvOfPythonPath(scan: Scan, cwd: string, word: string) {
  const abs = path.resolve(cwd, word);
  if (!VENV_PYTHON.test(path.basename(abs)) || path.basename(path.dirname(abs)) !== "bin") {
    return null;
  }
  return projectVenv(scan, path.dirname(path.dirname(abs)));
}

/**
 * The environment the session's PATH makes a bare `python`/`python3` run (an
 * activated virtual environment's bin first on PATH), or null (the toolchain's).
 */
function sessionVenvPython(scan: Scan, prog: string) {
  const pathVar = scan.ctx.environment?.PATH;
  if (!pathVar) {
    return null;
  }
  for (const d of pathVar.split(path.delimiter)) {
    // A directory named with `.` or `..` components: not resolved lexically here.
    if (!d || !path.isAbsolute(d) || d.split("/").some((c) => c === "." || c === "..")) {
      return null;
    }
    if (viewFs.existsSync(path.join(d, prog))) {
      return path.basename(d) === "bin" &&
        viewFs.existsSync(path.join(path.dirname(d), "pyvenv.cfg"))
        ? projectVenv(scan, path.dirname(d))
        : null;
    }
  }
  return null;
}

/** The path of `prog` in an activated virtual environment's bin first on the session's PATH, or null. */
function sessionVenvBin(scan: Scan, prog: string): string | null {
  const pathVar = scan.ctx.environment?.PATH;
  if (!pathVar || !/^[A-Za-z0-9._+-]+$/.test(prog)) {
    return null;
  }
  for (const d of pathVar.split(path.delimiter)) {
    // A directory named with `.` or `..` components: not resolved lexically here.
    if (!d || !path.isAbsolute(d) || d.split("/").some((c) => c === "." || c === "..")) {
      return null;
    }
    const p = path.join(d, prog);
    if (viewFs.existsSync(p)) {
      return path.basename(d) === "bin" &&
        viewFs.existsSync(path.join(path.dirname(d), "pyvenv.cfg"))
        ? p
        : null;
    }
  }
  return null;
}

/** One line, one Python: the toolchain's or one environment's (the guard sets the path for all of it). */
function usePython(scan: Scan, venv: PythonVenv | null): void {
  const key = venv ? venv.dir : "";
  if (scan.pythonKind !== undefined && scan.pythonKind !== key) {
    no("the line runs Python as two different environments");
  }
  scan.pythonKind = key;
  if (venv) {
    scan.pythonVenv = { dir: venv.dir, site: venv.site, systemSite: venv.systemSite };
  }
}

/** A pip console script for pytest (bin/pytest, bin/py.test) of an environment. */
const PYTEST_CONSOLE_SCRIPT =
  /^#![^\n]*\n(?:# -\*- coding: utf-8 -\*-\n)?(?:import re\n)?import sys\nfrom (?:pytest|_pytest\.config) import _?console_main\nif __name__ == ['"]__main__['"]:\n(?:    sys\.argv\[0\] = [^\n]*\n)?    sys\.exit\(_?console_main\(\)\)\n?$/;

/** A pytest option (the line's, or its settings' addopts): what loads plugins, settings or compiled text is refused. */
function pytestOption(t: string, from: string): void {
  const where = from ? ` (${from})` : "";
  if (
    /^(?:-p|--pyargs|-o|--override-ini|-c|--config-file|--confcutdir|--rootdir)(?:=|$)/.test(t) ||
    /^-[pc]./.test(t)
  ) {
    no(`pytest ${t}${where} loads plugins or settings Enclawed does not read`);
  }
  // A contained pytest runs no code built from text at run time: selection
  // expressions (-k, -m) and doctests are compiled from strings.
  if (/^-[km]/.test(t) || /^--(?:keyword|doctest)/.test(t)) {
    no(`pytest ${t}${where} compiles expressions or doctests, which a contained run does not run`);
  }
}

/**
 * The options pytest's settings add to every run (addopts of pytest.ini,
 * pyproject.toml's [tool.pytest] or [tool.pytest.ini_options], tox.ini's
 * [pytest], setup.cfg's [tool:pytest]) in the run's directory and the ones
 * above it in the project, as words. A settings file whose addopts Enclawed
 * cannot read as words is refused.
 */
function pytestConfigOptions(scan: Scan, cwd: string): string[] {
  const out: string[] = [];
  const section = /^\s*\[(?:pytest|tool:pytest|tool\.pytest|tool\.pytest\.ini_options)\]\s*$/;
  for (
    let d = cwd;
    isInside(scan.ctx.projectDir, d) || d === scan.ctx.projectDir;
    d = path.dirname(d)
  ) {
    for (const name of ["pytest.ini", "pyproject.toml", "tox.ini", "setup.cfg"]) {
      const f = path.join(d, name);
      let text: string;
      try {
        text = viewFs.readBytes(f).toString("utf8");
      } catch {
        continue;
      }
      let inSection = false;
      const lines = text.split(/\r?\n/);
      for (let k = 0; k < lines.length; k++) {
        const line = lines[k];
        if (/^\s*\[/.test(line)) {
          inSection = section.test(line);
          continue;
        }
        const m = inSection ? /^\s*addopts\s*=\s*(.*)$/.exec(line) : null;
        if (!m) {
          continue;
        }
        let value = m[1];
        // ini: continuation lines are indented; toml: a string or an array of strings.
        if (name !== "pyproject.toml") {
          while (
            k + 1 < lines.length &&
            /^\s+\S/.test(lines[k + 1]) &&
            !/^\s*\[/.test(lines[k + 1])
          ) {
            value += ` ${lines[++k]}`;
          }
        } else if (/^\[/.test(value)) {
          while (!value.includes("]") && k + 1 < lines.length) {
            value += ` ${lines[++k]}`;
          }
        }
        if (name === "pyproject.toml") {
          const strs = [...value.matchAll(/"([^"\\]*)"|'([^'\\]*)'/g)].map(
            (x) => x[1] ?? x[2] ?? "",
          );
          if (strs.length === 0 && value.trim() !== "") {
            no(
              `${path.relative(scan.ctx.projectDir, f)} sets pytest's addopts in a form Enclawed does not read`,
            );
          }
          value = strs.join(" ");
        }
        if (/["'\\$`]/.test(value)) {
          no(
            `${path.relative(scan.ctx.projectDir, f)} sets pytest's addopts with quoting Enclawed does not read`,
          );
        }
        out.push(...value.split(/\s+/).filter(Boolean));
      }
    }
    if (d === scan.ctx.projectDir || path.dirname(d) === d) {
      break;
    }
  }
  return out;
}

function checkPython(
  scan: Scan,
  args: readonly string[],
  cwd: string,
  stdin: string | null = null,
  prog = "python3",
): void {
  let i = 0;
  let isolated = false;
  while (i < args.length && /^-[IBEsuOqP]+$/.test(args[i])) {
    isolated ||= /[IP]/.test(args[i]);
    i++;
  }
  const a = args[i];
  if (a === "-c") {
    // -c: the current directory is searched first, unless isolated (-I, -P).
    checkPythonCode(
      scan,
      args[i + 1] ?? "",
      "the inline code",
      isolated ? [] : [cwd],
      null,
      args.slice(i + 2),
      prog,
    );
    return;
  }
  if (a === "-" || a === undefined) {
    // `python3 -` or `python3` alone runs what its standard input holds: only a
    // here-document of the line is read (its text is fixed by the line; the
    // guard runs it only with the digest read here).
    if (stdin === null) {
      no("python reads its program from input Enclawed does not read");
    }
    checkPythonCode(
      scan,
      stdin,
      "the code on standard input",
      isolated ? [] : [cwd],
      null,
      args.slice(i + 1),
      prog,
    );
    scan.stdin.add(createHash("sha256").update(stdin, "utf8").digest("hex"));
    return;
  }
  if (a === "-m") {
    const mod = args[i + 1];
    if (mod !== "pytest" && mod !== "unittest") {
      no(`python -m ${mod ?? ""} is not a module Enclawed reads`);
    }
    if (mod === "pytest") {
      scan.pytestRun = true;
      // The options its settings add (addopts) are read like the line's own.
      for (const t of pytestConfigOptions(scan, cwd)) {
        pytestOption(t, "its settings' addopts");
      }
    }
    // Their arguments name what they load: unittest a module, class or test by
    // dotted name (only of the project's files), pytest plugins and settings.
    for (const t of args.slice(i + 2)) {
      if (mod === "pytest") {
        pytestOption(t, "");
      }
      if (mod === "unittest" && !t.startsWith("-") && !unittestNameInProject(cwd, t)) {
        no(`python -m unittest ${t.slice(0, 80)} names tests outside the project's files`);
      }
    }
    const walk = (d: string, depth: number) => {
      if (depth > 10) {
        return;
      }
      let ents: fs.Dirent[] = [];
      try {
        ents = viewFs.readdirEntries(d);
      } catch {
        return;
      }
      for (const e of ents) {
        if ([".git", "node_modules", ".venv", "venv", "__pycache__"].includes(e.name)) {
          continue;
        }
        const p = path.join(d, e.name);
        if (e.isDirectory() && viewFs.existsSync(path.join(p, "pyvenv.cfg"))) {
          continue; // a virtual environment: not the project's tests
        }
        if (e.isDirectory()) {
          walk(p, depth + 1);
        } else if (/^(test_.*|.*_test|conftest)\.py$/.test(e.name)) {
          // pytest puts the test file's directory and the root on the path.
          scanPython(scan, p, [path.dirname(p), cwd], [], prog);
        }
      }
    };
    walk(cwd, 0);
    return;
  }
  if (a.startsWith("-")) {
    no(`python ${a} is not a form Enclawed reads`);
  }
  const file = path.resolve(cwd, a);
  scanPython(scan, file, isolated ? [] : [path.dirname(file)], args.slice(i + 1), prog);
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
          { fileRedirects: true, shell: scan.dialect },
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
/**
 * A shell script the line runs or sources, read only when it exists now. A
 * script a shell runs is run, in the containment, as the copy read here (its
 * code pin, ../containment/code-guard.ts shellWrapper), whatever the file holds
 * by then. A sourced one (`.`, `source`) is read by a shell that is already
 * running, from the file as it is then: it is read here only when nothing
 * before it on the line may have changed project files (an earlier command
 * that runs code, writes, deletes or copies).
 */
function shellScriptRead(
  scan: Scan,
  file: string,
  sourced: boolean,
): { real: string; text: string } {
  if (sourced && scan.changedFiles) {
    no(
      `it runs the script ${file}, after an earlier command of the line that may change project files`,
    );
  }
  const via = resolveViewPath("/", path.resolve(file));
  if (via.kind === "refused") {
    no(`it runs the script ${file}: ${via.why}`);
  }
  const real = scan.ctx.fs.realpathNearest(path.resolve(file));
  if (!scan.ctx.overlay?.has(real) && !viewFs.existsSync(real)) {
    no(`it runs the script ${file}, which does not exist when Enclawed reads the line`);
  }
  const r = readCode(scan, file);
  scan.shell.add(r.real);
  return r;
}

function scanShellScript(
  scan: Scan,
  file: string,
  cwd: string,
  depth: number,
  params: readonly string[] | null = null,
  sourced = false,
  dialect: "dash" | "bash" | null = null,
): void {
  // A sourced file runs in the shell that sources it; a script in the shell that runs it.
  const outerDialect = scan.dialect;
  scan.dialect = dialect ?? scan.dialect;
  try {
    scanShellScriptIn(scan, file, cwd, depth, params, sourced);
  } finally {
    scan.dialect = outerDialect;
  }
}

function scanShellScriptIn(
  scan: Scan,
  file: string,
  cwd: string,
  depth: number,
  params: readonly string[] | null,
  sourced: boolean,
): void {
  const { real, text } = shellScriptRead(scan, file, sourced);
  const what = path.relative(scan.ctx.projectDir, real);
  if (DEV_NET.test(text)) {
    no(`${what} opens a network connection`);
  }
  const lines = text.replace(/^#!.*\n/, "").split(/\r?\n/);
  let dir = cwd;
  const run = (raw: string) => {
    const line = arithmeticRead(scan, raw, dir, depth);
    const p = parseCompound(line, { cwd: dir, home: scan.ctx.home }, { shell: scan.dialect });
    if (!p.ok) {
      no(`${what} holds a line Enclawed does not read (${p.code})`);
    }
    checkCommands(scan, p.commands, depth + 1);
    // A `cd` to a directory that exists moves the rest of the script there.
    for (const c0 of p.commands) {
      const c = expandedCommand(scan, c0);
      if (c.argv[0] === "cd" && c.argv.length === 2) {
        // cd fails (null): the shell stays.
        dir = cdTarget(c.cwd, c.argv[1]) ?? dir;
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
  // A file run directly is read by its interpreter: a shell reads it as data.
  const peek = readCode(scan, file);
  const shellBang = /^#!\s*(?:\S*\/)?(?:env\s+)?(?:sh|bash|dash)\b/.test(peek.text);
  const { real, text } = shellBang ? shellScriptRead(scan, file, false) : peek;
  scan.executed.add(real);
  const bang = /^#!\s*(\S+)(?:\s+(\S+))?/.exec(text)?.[0] ?? "";
  // The kernel runs the interpreter the first line names, by its path: through
  // the same resolution as any program the line names (no link into the
  // containment's own files, no interpreter in the project).
  const named = bang.replace(/^#!\s*/, "").split(/\s+/)[0] ?? "";
  if (named.startsWith("/")) {
    const via = resolveViewPath("/", named);
    if (via.kind === "refused") {
      no(`${path.relative(scan.ctx.projectDir, real)} names the interpreter ${named}: ${via.why}`);
    }
    if (via.kind === "found" && isInside(scan.ctx.projectDir, via.real)) {
      no(`${path.relative(scan.ctx.projectDir, real)} names an interpreter in the project`);
    }
  }
  const interp = path.basename(
    bang.replace(/^#!\s*/, "").split(/\s+/)[0] === "/usr/bin/env"
      ? (bang.split(/\s+/)[1] ?? "")
      : bang.replace(/^#!\s*/, "").split(/\s+/)[0],
  );
  if (/^(sh|bash|dash)$/.test(interp)) {
    scanShellScript(scan, real, cwd, depth, params, false, interp === "bash" ? "bash" : "dash");
  } else if (/^node$/.test(interp)) {
    scanJs(scan, real);
  } else if (/^python3?$/.test(interp)) {
    // The interpreter the shebang names (by its path, or by name through env).
    const named = bang.replace(/^#!\s*/, "").split(/\s+/)[0];
    // The interpreter's path as the kernel follows it: no `..` over a link.
    const over = named.startsWith("/") ? dotDotOverLink("/", named) : null;
    if (over) {
      no(`its #! line steps back over the link ${over} with ..`);
    }
    const venv = named.startsWith("/") ? venvOfPythonPath(scan, "/", named) : null;
    if (
      venv ||
      (isInside(path.join(path.dirname(path.dirname(real)), "bin"), real) &&
        viewFs.existsSync(path.join(path.dirname(path.dirname(real)), "pyvenv.cfg")))
    ) {
      // A program of a virtual environment (its bin): only pytest's console script,
      // run as `python -m pytest` of that environment.
      if (
        !venv ||
        !/^(?:pytest|py\.test)$/.test(path.basename(real)) ||
        !PYTEST_CONSOLE_SCRIPT.test(text)
      ) {
        no(
          `it runs ${path.relative(scan.ctx.projectDir, real)}, a program of a Python environment Enclawed reads only for pytest`,
        );
      }
      usePython(scan, venv);
      scan.pytestRun = true;
      scanPython(scan, real, null, [], venv.interpreter);
      checkPython(scan, ["-m", "pytest", ...(params ?? [])], cwd, null, venv.interpreter);
      return;
    }
    usePython(scan, null);
    scanPython(scan, real, null, params ?? [], named === "/usr/bin/env" ? interp : named);
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
      ents = viewFs.readdirEntries(d);
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
  "--test-reporter-destination",
  "--test-name-pattern",
  "--test-skip-pattern",
  "--test-concurrency",
  "--test-timeout",
  "--input-type",
]);

/** node's own test reporters (a reporter is code node loads; these are built in). */
export const NODE_BUILTIN_REPORTERS = new Set(["spec", "tap", "dot", "junit", "lcov"]);

/**
 * The value of one of node's value options: a reporter is code (built in, or a
 * project file read like the rest), a destination is where it writes (standard
 * output or error, or a project file), the rest are numbers, a module type or
 * a name pattern.
 */
function checkNodeValue(scan: Scan, name: string, value: string | undefined, cwd: string): void {
  if (value === undefined) {
    no(`node ${name} without a value`);
  }
  if (name === "--test-reporter") {
    if (NODE_BUILTIN_REPORTERS.has(value)) {
      return;
    }
    const r = resolveViewPath(cwd, value);
    if (
      !(value.startsWith("./") || value.startsWith("../") || value.startsWith("/")) ||
      r.kind !== "found" ||
      !isInside(scan.ctx.projectDir, r.real)
    ) {
      no(`node --test-reporter ${value.slice(0, 80)}: a reporter is node's own or a project file`);
    }
    scanJs(scan, r.real);
    return;
  }
  if (name === "--test-reporter-destination") {
    if (value === "stdout" || value === "stderr") {
      return;
    }
    const abs = path.resolve(cwd, value);
    const r = resolveViewPath("/", abs);
    if (r.kind === "refused" || !isInside(scan.ctx.projectDir, scan.ctx.fs.realpathNearest(abs))) {
      no(`node --test-reporter-destination ${value.slice(0, 80)}: outside the project`);
    }
    scan.writes.add(scan.ctx.fs.realpathNearest(abs));
    return;
  }
  if ((name === "--test-concurrency" || name === "--test-timeout") && !/^\d+$/.test(value)) {
    no(`node ${name} with a value that is not a number`);
  }
  if (name === "--input-type" && value !== "module" && value !== "commonjs") {
    no(`node --input-type ${value.slice(0, 40)}`);
  }
}

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
        const eq = a.indexOf("=");
        checkNodeValue(scan, name, eq >= 0 ? a.slice(eq + 1) : args[++i], cwd);
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
        const files = shellGlob(cwd, t);
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
        dir = viewFs.statSync(abs).isDirectory();
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

/** Package-runner settings that choose what runs a script (or load code into it). */
const PACKAGE_RUNNER_CONFIG =
  /^\s*["']?(?:script[-_]?shell|scriptShell|shell|node[-_]?options|nodeOptions|scripts[-_]prepend[-_]node[-_]path|prefix|global[-_]?config|user[-_]?config|onload[-_]script|call|init[-_]module|npm[-_]path|yarnPath|yarn-path|shellEmulator|shell-emulator|pnpmfile|global-pnpmfile|unsafe[-_]perm|node[-_]linker|preload|env)["']?\s*[=:]/im;

function checkPackageScript(
  scan: Scan,
  prog: string,
  args: readonly string[],
  cwd: string,
  depth: number,
): void {
  let dir = cwd;
  let named = false;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--prefix" || a === "-C" || a === "--dir" || a === "--cwd") {
      dir = path.resolve(cwd, args[++i] ?? "");
      named = true;
    } else if (a.startsWith("--prefix=")) {
      dir = path.resolve(cwd, a.slice("--prefix=".length));
      named = true;
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
  const under = (d: string, f: string) => path.join(d, f);
  const rel = (f: string) => path.relative(scan.ctx.projectDir, f) || ".";
  const has = (d: string, f: string) => {
    try {
      viewFs.statSync(under(d, f));
      return true;
    } catch {
      return false;
    }
  };
  // The directories from `from` up to the project, nearest first.
  const upToProject = (from: string) => {
    const out: string[] = [];
    for (let d = from; isInside(scan.ctx.projectDir, d); d = path.dirname(d)) {
      out.push(d);
      if (d === scan.ctx.projectDir || d === path.dirname(d)) {
        break;
      }
    }
    return out;
  };
  // With no directory named, the runner works in the package the working
  // directory is in: the nearest directory up holding its manifest. npm and
  // pnpm also stop at one holding node_modules (then they find no manifest
  // and fail); pnpm also reads package.yaml and package.json5, which Enclawed
  // does not read. A workspace member is its own package: npm and pnpm run
  // its scripts in its directory (the workspace root only adds configuration,
  // read below). Above the project the view has no files: the runner finds none.
  if (!named) {
    for (const d of upToProject(dir)) {
      if (prog === "pnpm" && (has(d, "package.yaml") || has(d, "package.json5"))) {
        no(`pnpm reads ${rel(d)}'s package.yaml or package.json5, which Enclawed does not read`);
      }
      if (
        has(d, "package.json") ||
        ((prog === "npm" || prog === "pnpm") && has(d, "node_modules"))
      ) {
        dir = d;
        break;
      }
    }
  }
  // The runner's own configuration may choose the program that runs scripts
  // (script-shell, node-options, yarnPath, ...): a project file that sets one
  // asks. Every directory from the working directory, and from the package,
  // up to the project: npm reads the package's (or its workspace root's)
  // .npmrc, pnpm its workspace root's, yarn berry each .yarnrc.yml from the
  // working directory up. The user's and the global files are the
  // launcher's own empty ones.
  const configDirs = [...new Set([...upToProject(cwd), ...upToProject(dir)])];
  if (!isInside(scan.ctx.projectDir, dir)) {
    configDirs.push(dir);
  }
  for (const d of configDirs) {
    for (const name of [
      ".npmrc",
      ".yarnrc",
      ".yarnrc.yml",
      ".pnpmrc",
      "pnpm-workspace.yaml",
      "bunfig.toml",
    ]) {
      let text = "";
      const f = under(d, name);
      try {
        text = viewFs.readText(f);
      } catch {
        continue;
      }
      if (PACKAGE_RUNNER_CONFIG.test(text)) {
        no(`${rel(f)} sets how ${prog} runs scripts`);
      }
    }
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
      (JSON.parse(viewFs.readText(pkg)) as { scripts?: Record<string, unknown> }).scripts ?? {};
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
  // yarn (classic and berry) and bun run something else for a name the
  // package does not define: a program of node_modules/.bin, a file, or
  // (berry, a name with a colon) another workspace's script.
  if ((prog === "yarn" || prog === "bun") && typeof scripts[script] !== "string") {
    no(`${prog} ${script} is not a script of ${rel(pkg)}`);
  }
  for (const k of [`pre${script}`, script, `post${script}`]) {
    const text = scripts[k];
    if (typeof text !== "string") {
      continue;
    }
    // The runner hands it to sh (dash: the launcher's script-shell).
    const p = parseCompound(text, { cwd: dir, home: scan.ctx.home }, { shell: "dash" });
    if (!p.ok) {
      no(`the ${k} script is a line Enclawed does not read (${p.code})`);
    }
    // The package runner hands it to `sh -c`: the contained shell runs it only as read here.
    scan.shellText.add(text);
    // npm/pnpm/yarn put node_modules/.bin of the package and each directory up
    // to the project first on the script's PATH.
    const bins: string[] = [];
    for (
      let d = dir;
      isInside(scan.ctx.projectDir, d) || d === scan.ctx.projectDir;
      d = path.dirname(d)
    ) {
      bins.push(path.join(d, "node_modules", ".bin"));
      if (d === scan.ctx.projectDir || d === path.dirname(d)) {
        break;
      }
    }
    const outerBins = scan.binDirs;
    const outerDialect = scan.dialect;
    scan.binDirs = bins;
    scan.dialect = "dash";
    try {
      checkCommands(scan, p.commands, depth + 1);
    } finally {
      scan.binDirs = outerBins;
      scan.dialect = outerDialect;
    }
  }
}

// ─── Programs that only read or write files ─────────────────────────────

/** Builtins that change nothing (their exit status only). */
const NO_EFFECT = new Set(["exit", "return", "true", "false", ":", "test", "[", "shift", "wait"]);

/**
 * Inside the project, or (a line the host runs itself, ContainedContext
 * hostScratch) inside one of the session's scratch directories, where history
 * is irrelevant: such a line is then marked to run on the host, never contained.
 */
function inReach(scan: Scan, p: string): boolean {
  const real = scan.ctx.fs.realpathNearest(path.resolve(p));
  if (isInside(scan.ctx.projectDir, real)) {
    return true;
  }
  const hit = (scan.ctx.hostScratch ?? []).some((d) =>
    isInside(scan.ctx.fs.realpathNearest(d), real),
  );
  if (hit) {
    scan.scratchTouched = true;
  }
  return hit;
}

/** In one of the session's scratch directories (hostScratch) and not in the project. */
function inScratchOnly(scan: Scan, p: string): boolean {
  const real = scan.ctx.fs.realpathNearest(path.resolve(p));
  return (
    !isInside(scan.ctx.projectDir, real) &&
    (scan.ctx.hostScratch ?? []).some((d) => isInside(scan.ctx.fs.realpathNearest(d), real))
  );
}

/**
 * A path outside the project that the containment shows as its own empty
 * place: the person's home (the containment's HOME is a fresh tmpfs) and
 * /tmp (a private tmpfs). What a contained run does there never reaches this
 * machine's files.
 */
function privateInContainment(scan: Scan, p: string): boolean {
  // Run by the host's own shell, nothing outside the project is private.
  if (scan.ctx.hostScratch) {
    return false;
  }
  const abs = path.resolve(p);
  if (isInside(scan.ctx.projectDir, scan.ctx.fs.realpathNearest(abs))) {
    return false;
  }
  return isInside("/tmp", abs) || (scan.ctx.home !== null && isInside(scan.ctx.home, abs));
}

/** A file a program reads: inside the project (the view shows nothing else) and holding no secret. */
function readable(scan: Scan, cwd: string, f: string): void {
  const abs = path.resolve(cwd, f);
  if (!inReach(scan, abs)) {
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
  if (!inReach(scan, abs)) {
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
/**
 * The builtins of the shell package runners run script lines with (dash, as
 * /bin/sh, the launcher's script-shell): found before any PATH directory.
 */
const SCRIPT_SHELL_BUILTINS = new Set(
  ". : [ alias bg break cd chdir command continue echo eval exec exit export false fc fg getopts hash jobs kill local printf pwd read readonly return set shift test times trap true type ulimit umask unalias unset wait".split(
    " ",
  ),
);

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
      viewFs.lstatSync(path.resolve(cwd, prog));
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
    // The containment's PATH holds only programs found on this host's: a directory
    // the view refuses is on none of it (resolved here, never recorded).
    if (resolveViewPath("/", path.join(d, prog)).kind === "found") {
      return false;
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
/**
 * A file pattern as the contained shell will expand it: refused when it holds
 * a bracket expression the shells read differently from this reading
 * (`[^...]`, which dash takes literally, or a `[:class:]`).
 */
function shellGlob(cwd: string, word: string): string[] {
  if (/\[(?:!?\^|[^\]]*\[:)/.test(word)) {
    no(`${word.slice(0, 80)} is a pattern the contained shell reads differently`);
  }
  return expandGlob(cwd, word);
}

/**
 * The words a command's shell passes: each word it expands as a file pattern
 * (an unquoted *, ? or [) replaced by the files it names now, as sh and bash do
 * (no match: the word itself). Every path Enclawed reads from the command
 * (., source, cd, script operands, --prefix, arguments) is taken from these.
 */
function expandedCommand(scan: Scan, c: SimpleCommand): SimpleCommand {
  if (!c.globbed?.some(Boolean)) {
    return c;
  }
  if (c.globbed.length !== c.argv.length || c.globbed[0]) {
    no("a pattern Enclawed cannot place in the command's words");
  }
  // A pattern names the files that exist when it runs. For `.` and source (the
  // shell reads the file itself) and cd (later commands run there), none may be
  // new by then; node, python and the shell guard check at run time what loads.
  const prog = c.argv[0] ?? "";
  if (scan.mayCreate && [".", "source", "cd"].includes(prog)) {
    no("a file pattern after a command that may create files");
  }
  const argv = c.argv.flatMap((w, i) => {
    if (!c.globbed?.[i]) {
      return [w];
    }
    const files = shellGlob(c.cwd, w);
    if (files.length === 1 && files[0] === w) {
      return [w]; // no match: the shell passes the word as written
    }
    // A name that is itself a pattern would be read as one again below.
    if (files.some((f) => /[*?[\]]/.test(f))) {
      no(`${w.slice(0, 80)} names a file whose name is itself a pattern`);
    }
    return files;
  });
  return { ...c, argv, globbed: undefined };
}

export function expandGlob(cwd: string, word: string): string[] {
  if (!/[*?[]/.test(word)) {
    return [word];
  }
  const dir = path.dirname(word);
  if (/[*?[]/.test(dir)) {
    return expandDirPattern(cwd, word);
  }
  return expandLast(cwd, word, false);
}

/**
 * A pattern in a directory name (`/usr/local/cuda*\/bin/nvcc`): as the shell
 * does, the first component with a pattern is matched against the
 * directories there, the rest is matched (or, literal, must exist) below each
 * match, and the files named are sorted; no match at all: the word itself.
 */
function expandDirPattern(cwd: string, word: string): string[] {
  const parts = word.split("/");
  const at = parts.findIndex((p) => /[*?[]/.test(p));
  const head = parts.slice(0, at + 1).join("/");
  const rest = parts.slice(at + 1).join("/");
  const out: string[] = [];
  for (const d of expandLast(cwd, head, true)) {
    if (d === head) {
      continue; // no directory matched
    }
    const next = `${d}/${rest}`;
    const hits = /[*?[]/.test(rest)
      ? expandGlob(cwd, next).filter((h) => h !== next)
      : (() => {
          const r = resolveViewPath(cwd, next);
          if (r.kind === "refused") {
            no(`${next.slice(0, 80)}: ${r.why}`);
          }
          return r.kind === "found" ? [next] : [];
        })();
    out.push(...hits);
    if (out.length > MAX_FILES) {
      no(`a pattern that matches more files than Enclawed reads (${word.slice(0, 80)})`);
    }
  }
  return out.length ? out.toSorted() : [word];
}

/** The last component of `word` as a pattern (`dirsOnly`: only directories, links to them too). */
function expandLast(cwd: string, word: string, dirsOnly: boolean): string[] {
  const dir = path.dirname(word);
  const base = path.basename(word);
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
    names = viewFs.readdirNames(path.resolve(cwd, dir));
  } catch {
    return [word];
  }
  // The contained shells match in the C locale (one byte per ? and per bracket);
  // a name outside ASCII would be matched here by its characters instead.
  if (/[?[]/.test(base) && names.some((n) => /[^\x00-\x7f]/.test(n))) {
    no(`${word.slice(0, 80)} is matched against names outside ASCII`);
  }
  const isDir = (n: string) => {
    const r = resolveViewPath(cwd, `${dir}/${n}`);
    if (r.kind === "refused") {
      no(`${dir.slice(0, 60)}/${n.slice(0, 40)}: ${r.why}`);
    }
    try {
      return r.kind === "found" && viewFs.statSync(r.real).isDirectory();
    } catch {
      return false;
    }
  };
  const hits = names
    .filter((n) => rx.test(n) && (base.startsWith(".") || !n.startsWith(".")))
    .filter((n) => !dirsOnly || isDir(n))
    .toSorted()
    // The directory as written (./ kept): the shell keeps it, and `. ./x` and `. x` differ.
    .map((n) => `${word.slice(0, word.length - base.length)}${n}`);
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
      ents = viewFs.readdirEntries(d);
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
  /\bsystem\b|\bgetline\b|(?<!\|)\|(?!\|)|\bclose\s*\(|\bfflush\b|\bENVIRON\b|\bPROCINFO\b|@|\bprintf?\b[^;}\n]*>/;

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
  // The program find runs must be a literal word: `{}` there runs whatever file it finds.
  if (exec?.[0]?.includes("{}")) {
    no("find -exec runs each file it finds as the program");
  }
  // What find selects is read now: a file an earlier command creates is not.
  if (scan.mayCreate) {
    no("find runs a command on files an earlier command of the line may create");
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
        ents = viewFs.readdirEntries(d);
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

// Compressors read in place: suffix, whether the name decompresses by
// default, whether the source is kept by default (zstd), the decompressing
// options, and the flags read.
const COMPRESSORS = {
  gzip: { suffixes: [".gz", ".z", ".tgz"], decomp: false, keeps: false },
  gunzip: { suffixes: [".gz", ".z", ".tgz"], decomp: true, keeps: false },
  pigz: { suffixes: [".gz", ".z", ".tgz"], decomp: false, keeps: false },
  unpigz: { suffixes: [".gz", ".z", ".tgz"], decomp: true, keeps: false },
  bzip2: { suffixes: [".bz2", ".tbz2", ".tbz"], decomp: false, keeps: false },
  bunzip2: { suffixes: [".bz2", ".tbz2", ".tbz"], decomp: true, keeps: false },
  xz: { suffixes: [".xz", ".txz", ".lzma"], decomp: false, keeps: false },
  unxz: { suffixes: [".xz", ".txz", ".lzma"], decomp: true, keeps: false },
  zstd: { suffixes: [".zst", ".tzst"], decomp: false, keeps: true },
  unzstd: { suffixes: [".zst", ".tzst"], decomp: true, keeps: true },
} as const;
const COMPRESSOR_FLAG =
  /^-(?:[cdzkfqvnN1-9]+|-stdout|-to-stdout|-decompress|-uncompress|-compress|-keep|-force|-quiet|-verbose|-fast|-best|-rm|-no-name|-name)$/;

/** A compressor (gzip, bzip2, xz, zstd and their un- forms): to standard output, or in place. */
function compressor(
  scan: Scan,
  n: keyof typeof COMPRESSORS,
  args: readonly string[],
  cwd: string,
): void {
  const def = COMPRESSORS[n];
  const files = operands(n, args, COMPRESSOR_FLAG);
  const flags = args.filter((a) => a.startsWith("-") && a !== "-" && a !== "--");
  const short = flags.filter((a) => !a.startsWith("--")).join("");
  const has = (letter: string, ...long: string[]) =>
    short.includes(letter) || flags.some((a) => long.includes(a));
  const toStdout = has("c", "--stdout", "--to-stdout");
  const decomp = def.decomp || has("d", "--decompress", "--uncompress");
  if (toStdout || files.length === 0 || files.includes("-")) {
    // Standard output: a reader of its files (or of its input).
    for (const f of files) {
      if (f !== "-") {
        readable(scan, cwd, f);
      }
    }
    if (!toStdout && files.length && !decomp) {
      no(`${n} - compresses its input`);
    }
    return;
  }
  // zstd keeps its source unless --rm; the others delete it unless -k.
  const keeps = def.keeps ? !flags.includes("--rm") : has("k", "--keep");
  for (const w of files) {
    for (const f of shellGlob(cwd, w)) {
      const abs = path.resolve(cwd, f);
      let out: string;
      if (decomp) {
        const sfx = def.suffixes.find((x) => abs.toLowerCase().endsWith(x));
        if (!sfx) {
          no(`${n} -d ${f.slice(0, 80)}: a name without a suffix Enclawed reads`);
        }
        const stem = abs.slice(0, abs.length - sfx.length);
        // .tgz, .tbz2, .txz, .tzst: a tar archive.
        out = sfx.startsWith(".t") ? `${stem}.tar` : stem;
      } else {
        out = `${abs}${def.suffixes[0]}`;
      }
      let st: fs.Stats | null = null;
      try {
        st = viewFs.lstatSync(abs);
      } catch {
        /* nothing there: it fails on this name */
      }
      if (st?.isDirectory()) {
        continue; // without -r it skips a directory
      }
      if (st?.isSymbolicLink()) {
        no(`${n} ${f.slice(0, 80)}: a symbolic link`);
      }
      readable(scan, cwd, abs);
      written(scan, cwd, out);
      if (!keeps && st) {
        if (isExecConfigPath(abs)) {
          no(`${n} ${f.slice(0, 80)} removes configuration of what runs later`);
        }
        movedAway(scan, abs, out);
      }
    }
  }
}

/**
 * `from` is deleted and its content (or a transform of it Enclawed reads back
 * exactly: a compressed copy) lands at `to` in the same command: deleted
 * like an rm, backed up by `to` unless the line loses that copy later (copyLost).
 */
function movedAway(scan: Scan, from: string, to: string): void {
  scan.removed.add(from);
  scan.deletes.add(from);
  scan.copies.set(from, { dest: to, line: scan.line, pos: scan.pos });
  scan.backedUp.add(from);
}

/** mv: files and trees inside the project, each moved file a deletion backed up by where it lands. */
function moveFiles(scan: Scan, args: readonly string[], cwd: string): void {
  let target: string | null = null;
  let noTarget = false;
  const ops: string[] = [];
  let opts = true;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (opts && a === "--") {
      opts = false;
    } else if (opts && (a === "-t" || a === "--target-directory")) {
      target = args[++i] ?? null;
      if (target === null) {
        no("mv -t without a directory");
      }
    } else if (opts && a.startsWith("--target-directory=")) {
      target = a.slice("--target-directory=".length);
    } else if (opts && /^-[fvnT]+$|^--(?:force|verbose|no-clobber|no-target-directory)$/.test(a)) {
      noTarget ||= /^-[a-zA-Z]*T|^--no-target-directory$/.test(a);
    } else if (opts && a.startsWith("-") && a !== "-") {
      no(`mv ${a} is not an option Enclawed reads`);
    } else {
      ops.push(a);
    }
  }
  const dest = target ?? ops.pop();
  if (dest === undefined || ops.length === 0) {
    no("mv needs a source and a target");
  }
  const destAbs = path.resolve(cwd, dest);
  let destDir = target !== null || ops.length > 1;
  if (!destDir && !noTarget) {
    try {
      destDir = viewFs.statSync(destAbs).isDirectory();
    } catch {
      /* a new name */
    }
  }
  for (const w of ops) {
    for (const f of shellGlob(cwd, w)) {
      const abs = path.resolve(cwd, f);
      if (!inReach(scan, path.dirname(abs))) {
        no(`mv ${abs}, outside the project`);
      }
      if (isExecConfigPath(abs) || isExecConfigDir(abs)) {
        no(`mv ${f.slice(0, 80)} moves configuration of what runs later`);
      }
      let st: fs.Stats;
      try {
        st = viewFs.lstatSync(abs);
      } catch {
        continue; // nothing there: mv moves nothing
      }
      const to = destDir ? path.join(destAbs, path.basename(abs)) : destAbs;
      if (isInside(abs, to)) {
        continue; // into itself: mv refuses
      }
      // On the host a link moved into place would route a later path of the line elsewhere.
      if (
        scan.ctx.hostScratch &&
        (st.isSymbolicLink() ||
          (st.isDirectory() && filesBelow(abs).some((x) => viewFs.lstatSync(x).isSymbolicLink())))
      ) {
        no(`mv ${f.slice(0, 80)} moves a symbolic link outside the containment`);
      }
      if (st.isDirectory()) {
        if (isExecConfigDir(to)) {
          no(`mv ${f.slice(0, 80)} makes configuration of what runs later`);
        }
        for (const x of filesBelow(abs)) {
          const xTo = path.join(to, path.relative(abs, x));
          written(scan, cwd, xTo);
          movedAway(scan, x, xTo);
        }
      } else {
        written(scan, cwd, to);
        movedAway(scan, abs, to);
      }
    }
  }
}

/**
 * tar: creating an archive (-c) from files it reads, or listing one (-t).
 * Extraction writes names only the archive knows: not here. Left out: every
 * option that runs a program (-I/--use-compress-program, --to-command,
 * --checkpoint-action, -F/--info-script, --rsh-command), follows links out of
 * the named files (-h), reads names from a file (-T), and a remote archive
 * (a name with a colon).
 */
function tarFiles(scan: Scan, args: readonly string[], cwd: string): void {
  const words = [...args];
  // The first word may be the old style cluster without a dash (`czf OUT`).
  if (words[0] && !words[0].startsWith("-")) {
    words[0] = `-${words[0]}`;
  }
  let mode: "c" | "t" | null = null;
  let archive: string | null = null;
  let dir = cwd;
  const files: string[] = [];
  const pendingValues: ("f" | "C")[] = [];
  const LONG_FLAGS =
    /^--(?:create|list|gzip|bzip2|xz|zstd|auto-compress|verbose|exclude-vcs|exclude-vcs-ignores|numeric-owner|no-recursion|recursion|totals|(?:exclude|sort|mtime|owner|group|mode|format)=.+)$/;
  for (let i = 0; i < words.length; i++) {
    const a = words[i];
    if (pendingValues.length) {
      const v = pendingValues.shift();
      if (v === "f") {
        archive = a;
      } else {
        dir = path.resolve(dir, a);
      }
      continue;
    }
    if (a === "--") {
      files.push(...words.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      if (a === "--create") {
        mode = "c";
      } else if (a === "--list") {
        mode = "t";
      } else if (a.startsWith("--file=")) {
        archive = a.slice("--file=".length);
      } else if (a.startsWith("--directory=")) {
        dir = path.resolve(dir, a.slice("--directory=".length));
      } else if (a === "--file" || a === "--directory") {
        pendingValues.push(a === "--file" ? "f" : "C");
      } else if (!LONG_FLAGS.test(a)) {
        no(`tar ${a.slice(0, 40)} is not an option Enclawed reads`);
      }
      continue;
    }
    if (a.startsWith("-") && a !== "-") {
      for (const ch of a.slice(1)) {
        if (ch === "c" || ch === "t") {
          if (mode && mode !== ch) {
            no("tar with two modes");
          }
          mode = ch;
        } else if (ch === "f" || ch === "C") {
          pendingValues.push(ch);
        } else if (!"zjJav".includes(ch)) {
          no(`tar -${ch} is not an option Enclawed reads`);
        }
      }
      continue;
    }
    files.push(a);
  }
  if (!mode || archive === null || archive === "" || archive === "-" || pendingValues.length) {
    no("tar without -c or -t and one archive file");
  }
  if (archive.includes(":")) {
    no("tar with an archive name that names a host");
  }
  if (!inReach(scan, dir)) {
    no(`tar -C ${dir}, outside the project`);
  }
  if (mode === "t") {
    readable(scan, cwd, archive);
    return;
  }
  if (files.length === 0) {
    no("tar -c with no file");
  }
  for (const f of files) {
    for (const x of shellGlob(dir, f)) {
      readable(scan, dir, x);
    }
  }
  written(scan, cwd, archive);
}

/** Options of a command that each take the next word (or `=value`), and its other flags. */
function optionsWithValues(
  prog: string,
  args: readonly string[],
  flags: RegExp,
  valued: ReadonlySet<string>,
): { ops: string[]; values: Map<string, string> } {
  const ops: string[] = [];
  const values = new Map<string, string>();
  let opts = true;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (opts && a === "--") {
      opts = false;
    } else if (opts && valued.has(a)) {
      values.set(a, args[++i] ?? "");
    } else if (opts && a.includes("=") && valued.has(a.slice(0, a.indexOf("=")))) {
      values.set(a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1));
    } else if (opts && /^-[a-zA-Z]./.test(a) && valued.has(a.slice(0, 2))) {
      values.set(a.slice(0, 2), a.slice(2));
    } else if (opts && a.startsWith("-") && a !== "-") {
      if (!flags.test(a)) {
        no(`${prog} ${a} is not an option Enclawed reads`);
      }
    } else {
      ops.push(a);
    }
  }
  return { ops, values };
}

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
  // Compressors: to standard output (-c) they only read; in place they
  // replace each FILE by its compressed (or decompressed) copy: the copy is
  // decided as a Write, and the original's deletion as an rm whose content
  // survives in that copy (it is restorable from history either way).
  ...(Object.keys(COMPRESSORS) as (keyof typeof COMPRESSORS)[]).map(
    (n) =>
      [
        n,
        (scan: Scan, args: readonly string[], cwd: string) => compressor(scan, n, args, cwd),
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
        if (!inReach(scan, abs)) {
          no(`mkdir ${abs}, outside the project`);
        }
        // Only a directory is created (even .git/hooks): an empty directory runs nothing.
      }
    },
  ],
  ["mv", moveFiles],
  ["tar", tarFiles],
  [
    "ln",
    (scan, args, cwd) => {
      // A symbolic link only (a hard link is another name of the same file, wherever
      // it is): a new name in the project, decided as the equivalent Write. On the
      // host (hostScratch) a link made now would route a later path of the line
      // somewhere this reading did not resolve: only contained.
      if (scan.ctx.hostScratch) {
        no("ln outside the containment");
      }
      if (!args.some((a) => /^-[a-zA-Z]*s|^--symbolic$/.test(a))) {
        no("ln without -s makes a hard link");
      }
      const ops = operands(
        "ln",
        args,
        /^-(?:[sfvnrT]+|-symbolic|-force|-verbose|-no-dereference|-relative|-no-target-directory)$/,
      );
      if (ops.length !== 2) {
        no("ln -s with other than one target and one name");
      }
      const [target, name] = ops;
      if (target === "" || /[*?[]/.test(name)) {
        no("ln -s with a name Enclawed does not read");
      }
      const noDeref = args.some((a) =>
        /^-[a-zA-Z]*[nT]|^--no-(?:dereference|target-directory)$/.test(a),
      );
      let at = path.resolve(cwd, name);
      try {
        const st = noDeref ? viewFs.lstatSync(at) : viewFs.statSync(at);
        if (st.isDirectory()) {
          at = path.join(at, path.basename(target));
        }
      } catch {
        /* a new name */
      }
      written(scan, cwd, at);
    },
  ],
  [
    "truncate",
    (scan, args, cwd) => {
      // A size given in bytes (with a suffix or a relative sign): each file's content
      // is cut or extended (its prior content is kept by history, as for a Write).
      const { ops, values } = optionsWithValues(
        "truncate",
        args,
        /^-(?:[co]+|-no-create|-io-blocks)$/,
        new Set(["-s", "--size"]),
      );
      if (!values.has("-s") && !values.has("--size")) {
        no("truncate without -s SIZE");
      }
      for (const f of ops) {
        for (const x of shellGlob(cwd, f)) {
          written(scan, cwd, x);
        }
      }
    },
  ],
  ...(["dos2unix", "unix2dos"] as const).map(
    (n) =>
      [
        n,
        (scan: Scan, args: readonly string[], cwd: string) => {
          // In place (each FILE), or -n IN OUT pairs (OUT a written file).
          const pairs = args.some((a) => a === "-n" || a === "--newfile");
          const ops = operands(
            n,
            args,
            /^-(?:[qkfson]+|-quiet|-keepdate|-force|-safe|-newfile|-oldfile|-keep-bom|-remove-bom)$/,
          );
          if (pairs && ops.length % 2 !== 0) {
            no(`${n} -n needs pairs of files`);
          }
          ops.forEach((f, k) => {
            if (pairs && k % 2 === 0) {
              readable(scan, cwd, f);
            } else {
              for (const x of shellGlob(cwd, f)) {
                written(scan, cwd, x);
              }
            }
          });
        },
      ] as const,
  ),
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
      // Never set-user-ID, set-group-ID or sticky, and never write for the group or
      // others (a symbolic + or = of w for g, o, a or no one named: the umask decides).
      const m = mode ?? "";
      if (
        /^[0-7]{4}$/.test(m)
          ? m[0] !== "0" || /[2367]/.test(m.slice(2))
          : /^[0-7]{3}$/.test(m)
            ? /[2367]/.test(m.slice(1))
            : m.split(",").some((c) => {
                const k = /^([ugoa]*)([-+=])([rwxX]+)$/.exec(c);
                return (
                  !k || (k[2] !== "-" && k[3].includes("w") && (k[1] === "" || /[goa]/.test(k[1])))
                );
              })
      ) {
        no(`chmod ${m.slice(0, 20)} lets others write or runs as another user`);
      }
      for (const f of files) {
        for (const x of shellGlob(cwd, f)) {
          const abs = path.resolve(cwd, x);
          // A file there before the run keeps its old mode nowhere (history keeps
          // content, not modes): a file the line itself creates, one in the
          // session's scratch (no history needed there), or one this session made.
          let existed = false;
          try {
            viewFs.lstatSync(abs);
            existed = true;
          } catch {
            /* new: made earlier in the line, or chmod fails */
          }
          written(scan, cwd, x);
          // A file there before the run: decided in ./engine.ts (only one this session
          // created, whose prior state is no file at all).
          if (existed && !inScratchOnly(scan, abs)) {
            scan.modeChanges.add(abs);
          }
        }
      }
    },
  ],
  [
    "rm",
    (scan, args, cwd) => {
      // What it deletes is decided in ./engine.ts: only files this session created.
      const recursive = args.some((a) => /^-[a-zA-Z]*[rR]|^--recursive$/.test(a));
      for (const t of operands("rm", args, /^-(?:[frRv]+|-force|-recursive|-verbose)$/)) {
        for (const f of shellGlob(cwd, t)) {
          const abs = path.resolve(cwd, f);
          scan.removed.add(abs);
          if (privateInContainment(scan, abs)) {
            continue; // the containment's own /tmp or HOME: nothing of this machine
          }
          // Removing configuration of what runs later (there or not yet): a person decides.
          if (isExecConfigPath(abs) || isExecConfigDir(abs)) {
            no(`rm ${f} removes configuration of what runs later`);
          }
          if (!inReach(scan, path.dirname(abs))) {
            no(`rm ${abs}, outside the project`);
          }
          let st: fs.Stats;
          try {
            st = viewFs.lstatSync(abs);
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
      for (const w of files) {
        // A pattern names the files that exist when perl starts: none may be new.
        const pattern = /[*?[]/.test(w);
        if (pattern && scan.mayCreate) {
          no(`perl opens files ${w.slice(0, 80)} names, and the line may create some first`);
        }
        for (const f of pattern ? shellGlob(cwd, w) : [w]) {
          // -n opens its files with perl's two-argument open: "cmd|" would run cmd.
          if (/[|<>&]|^\s|\s$/.test(path.basename(f)) || /[|<>&]|^\s|\s$/.test(f)) {
            no(`perl would open ${f.slice(0, 80)} as more than a file`);
          }
          readable(scan, cwd, f);
        }
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
        // gawk calls a function whose name a variable holds (@NAME()): a -v value
        // is read by the same rules as the program.
        if (a === "-v" && AWK_EFFECTS.test(args[i + 1] ?? "")) {
          no("awk -v value Enclawed does not read");
        }
        if (/^-v./.test(a) && AWK_EFFECTS.test(a.slice(2))) {
          no("awk -v value Enclawed does not read");
        }
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
        } else if (AWK_EFFECTS.test(f)) {
          no("awk variable assignment Enclawed does not read");
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
        // GNU find replaces {} anywhere in a word.
        const argv = exec.map((x) => x.split("{}").join(f));
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
        dir = viewFs.statSync(path.resolve(cwd, dest)).isDirectory();
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
        for (const f of shellGlob(cwd, src)) {
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

/**
 * Why the repository's configuration could make git start something for
 * `sub` (./git-writes.ts gitRepoStarts: a key outside the inert list, a hook
 * the command may run, the same in each submodule's git directory), or null.
 * `extra`: keys the command never acts on.
 */
function gitStartsSomething(cwd: string, extra: RegExp | null, sub: string): string | null {
  return gitRepoStarts(cwd, extra, hooksRunBy(sub));
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
    text = gitDir ? viewFs.readText(path.join(gitDir, "config")) : "";
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
      {
        // git add replaces each index entry it matches: a staged change that
        // neither the commit nor the working file holds would be lost.
        const lost = stagedOnlyRefusal(dir, pathspecsOf(rest), (abs) =>
          [...(scan.ctx.overlay?.keys() ?? [])].some((p) => isInside(p, abs) || isInside(abs, p)),
        );
        if (lost) {
          no(`git add ${lost}`);
        }
      }
      break;
    case "commit":
    case "revert":
      // A commit is the person's approval point (every change before it stays
      // recorded and reversible until they approve one): it is never run contained.
      no(`git ${sub} makes a commit: a commit is the person's approval point, so it asks`);
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
    default: {
      // Local writes of refs, the index and files git holds (./git-writes.ts).
      if (sub === "switch" || sub === "checkout" || sub === "branch") {
        // These write HEAD and refs: the view keeps git's history writable for this line.
        scan.gitRefWrites = true;
      }
      const why = LOCAL_WRITE_SUBS.has(sub)
        ? localGitWriteRefusal(sub, rest, dir, {
            projectDir: scan.ctx.projectDir,
            realpathNearest: (p) => scan.ctx.fs.realpathNearest(p),
            changed: (abs) =>
              [...(scan.ctx.overlay?.keys() ?? [])].some(
                (p) => isInside(p, abs) || isInside(abs, p),
              ),
          })
        : `git ${sub} is not a git command Enclawed runs contained`;
      if (why) {
        no(why);
      }
    }
  }
  // Hooks run when git writes the index, a ref or a commit; reading commands start none.
  const why = gitStartsSomething(dir, extra, sub);
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
  // The containment's own files (the real programs its guards wrap, the guards):
  // never named by a line, as a program or an argument (`env`, `command`, a link).
  for (const w of [...argv, ...c.assigns.map((a) => a.value)]) {
    const abs = w.includes(".enclawed") ? path.resolve(c.cwd, w) : "";
    if (
      abs === "/.enclawed" ||
      abs.startsWith("/.enclawed/") ||
      (w === argv[0] && path.basename(w).startsWith(".enclawed-"))
    ) {
      no(`it names Enclawed's own containment files (${w.slice(0, 80)})`);
    }
  }
  for (const cwd of c.cwds) {
    const where = resolveViewPath("/", cwd);
    if (where.kind === "refused") {
      no(`it runs in ${cwd}: ${where.why}`);
    }
    if (!inReach(scan, cwd) && !privateInContainment(scan, cwd)) {
      no(`it runs in ${cwd}, outside the project`);
    }
  }
  const cwd = c.cwd;
  scan.cwd = cwd;
  // Every word Enclawed reads as a path is taken with `..` off the name
  // (path.resolve); the kernel follows each link first. A word whose `..`
  // steps back over a link means another place there: refused.
  for (const w of [
    ...argv,
    ...c.assigns.map((a) => a.value),
    ...(c.writes ?? []).map((x) => x.path),
    ...(c.reads ?? []),
  ]) {
    const over = dotDotOverLink(cwd, w);
    if (over) {
      no(`${w.slice(0, 80)} steps back over the link ${over} with ..`);
    }
  }
  const [prog, ...args] = argv;
  // A package script's line: npm/pnpm/yarn put each node_modules/.bin up the
  // tree first on its PATH, before every program Enclawed knows by name (sh,
  // node, python, env, git, ...): a name found there runs that file, read like
  // any file the line runs (it must lead into the project); only the shell's
  // own builtins come first.
  if (prog && !prog.includes("/") && scan.binDirs && !SCRIPT_SHELL_BUILTINS.has(prog)) {
    for (const d of scan.binDirs) {
      const cand = path.join(d, prog);
      let present = false;
      try {
        viewFs.lstatSync(cand);
        present = true;
      } catch {
        /* not here */
      }
      if (present) {
        const r = resolveViewPath("/", cand);
        if (r.kind !== "found" || !isInside(scan.ctx.projectDir, r.real)) {
          no(
            `${prog} in ${path.relative(scan.ctx.projectDir, d)} ${r.kind === "refused" ? r.why : "leads outside the project"}`,
          );
        }
        scanExecutable(scan, cand, cwd, depth, args);
        return;
      }
    }
  }
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
    for (const f of sedInPlaceTargets(args).flatMap((t) => shellGlob(cwd, t))) {
      const abs = path.resolve(cwd, f);
      if (!inReach(scan, abs)) {
        no(`sed -i edits ${abs}, outside the project`);
      }
      scan.writes.add(abs);
    }
    return;
  }
  const ro = classifyArgv(argv);
  if (ro.readOnly) {
    for (const a of args) {
      if (a.startsWith("/") || a.startsWith("~")) {
        const abs = path.resolve(cwd, expandHome(a, scan.ctx.home));
        // The containment's own /tmp and home are private and empty by design
        // (privateInContainment): a read there finds nothing, as it is meant to.
        if (
          !isInside(scan.ctx.projectDir, scan.ctx.fs.realpathNearest(abs)) &&
          !privateInContainment(scan, abs)
        ) {
          scan.systemReads.push(abs);
        }
      }
    }
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
  if (!FILE_PROGRAMS.has(prog) || prog.includes("/")) {
    scan.runsCode = true;
  }
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
    // `. NAME` with no slash is looked up on PATH first (sh: only there), not in the directory.
    if (!(args[0] ?? "").includes("/")) {
      no(`${prog} ${(args[0] ?? "").slice(0, 80)} looks its file up on PATH`);
    }
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
    scanShellScript(scan, file, cwd, depth, args.length > 1 ? args.slice(1) : null, true);
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
      const dialect = prog === "bash" ? "bash" : "dash";
      const p = parseCompound(text, { cwd, home: scan.ctx.home }, { shell: dialect });
      if (!p.ok) {
        no(`${prog} -c runs a line Enclawed does not read (${p.code})`);
      }
      scan.shellText.add(args[i + 1] ?? "");
      const outerDialect = scan.dialect;
      scan.dialect = dialect;
      try {
        checkCommands(scan, p.commands, depth + 1);
      } finally {
        scan.dialect = outerDialect;
      }
      return;
    }
    if (args[i] === undefined || args[i].startsWith("-")) {
      no(`${prog} ${args[i] ?? ""} reads its commands from somewhere Enclawed does not`);
    }
    scanShellScript(
      scan,
      path.resolve(cwd, args[i]),
      cwd,
      depth,
      args.slice(i + 1),
      false,
      prog === "bash" ? "bash" : "dash",
    );
    return;
  }
  if (prog === "node") {
    checkNode(scan, args, cwd);
    return;
  }
  if (prog === "python" || prog === "python3") {
    // An activated virtual environment (its bin first on the session's PATH):
    // `python3` is its Python.
    const venv = sessionVenvPython(scan, prog);
    usePython(scan, venv);
    checkPython(
      scan,
      args,
      cwd,
      c.piped && typeof c.stdin !== "string" ? null : (c.stdin ?? null),
      venv ? venv.interpreter : prog,
    );
    return;
  }
  if (PACKAGE_RUNNERS.has(prog)) {
    checkPackageScript(scan, prog, args, cwd, depth);
    return;
  }
  // A program word Enclawed cannot read as one literal name (a pattern, an
  // expansion): what it runs in the containment is not known here.
  if (/[*?[\]{}~$`\\]/.test(prog) || prog === "") {
    no(`${prog.slice(0, 80)} is not one literal program name`);
  }
  // A build tool (cmake, make, ninja, meson, ctest, cargo, go): its build
  // scripts are not read; it runs as a contained build when its own command
  // line is a build form with its outputs inside the project.
  if (BUILD_TOOLS.has(prog)) {
    const b = readBuildCommand(prog, args, {
      cwd,
      projectDir: scan.ctx.projectDir,
      realpathNearest: (p) => scan.ctx.fs.realpathNearest(p),
    });
    if (!b.ok) {
      no(b.why);
    }
    scan.ranCode = true;
    scan.buildTools.add(b.tool);
    scan.buildOutputs.push(...b.outputs);
    return;
  }
  if (prog.includes("/")) {
    const abs = path.resolve(cwd, prog);
    // Resolved component by component, every link followed (./resolveViewPath).
    // Absent here with no link on the way: the containment, which shows this
    // host's project and read-only toolchain and fresh empty /tmp, home and
    // /dev/shm, has nothing there either, unless the line may create it first.
    const r = resolveViewPath(cwd, prog);
    if (r.kind === "refused") {
      no(`${prog.slice(0, 80)}: ${r.why}`);
    }
    if (r.kind === "absent") {
      if (scan.mayCreate) {
        no(`${prog.slice(0, 80)} does not exist when Enclawed reads the line`);
      }
      return; // absent in the containment too: the shell runs nothing
    }
    // A project virtual environment's Python (.venv/bin/python): a link to the
    // toolchain's interpreter, run as that environment.
    const venv = venvOfPythonPath(scan, cwd, prog);
    if (venv) {
      usePython(scan, venv);
      checkPython(
        scan,
        args,
        cwd,
        c.piped && typeof c.stdin !== "string" ? null : (c.stdin ?? null),
        venv.interpreter,
      );
      return;
    }
    if (isInside(scan.ctx.projectDir, r.real)) {
      scanExecutable(scan, abs, cwd, depth, args);
      return;
    }
  }
  // A program the session's activated virtual environment provides (its bin
  // first on PATH): the containment's PATH does not show it.
  if (!prog.includes("/") && sessionVenvBin(scan, prog)) {
    no(
      `${prog} is a program of the session's activated Python environment; run it as ${path.relative(cwd, sessionVenvBin(scan, prog) ?? prog)} or python3 -m ${prog}`,
    );
  }
  if (prog === "git") {
    scan.gitBeyondReadOnly = true;
    checkGit(scan, args, cwd);
    return;
  }
  if (FILE_PROGRAMS.has(prog)) {
    FILE_PROGRAMS.get(prog)?.(scan, args, cwd);
    return;
  }
  // A name on no PATH directory here: the containment's PATH holds only this
  // host's read-only program directories (a package script's node_modules/.bin
  // is read above), so the shell finds nothing there either, unless something
  // earlier in the line may create it.
  if (commandNotFound(prog, cwd)) {
    if (scan.mayCreate) {
      no(
        `${prog.slice(0, 80)} is not found when Enclawed reads the line, and the line may create it first`,
      );
    }
    return;
  }
  if (versionProbe(prog, args, cwd)) {
    // A toolchain program asked for its version: what it does is not read, so it runs only contained.
    scan.runs = true;
    return;
  }
  no(`${prog} is not a program Enclawed reads`);
}

/** The one argument with which a program prints its version (`nvcc --version`, `cmake -V`, `go version`). */
const VERSION_ARGS = new Set(["--version", "-version", "-V", "version"]);
/**
 * Directories of installed toolchains: the system's program directories, the
 * CUDA toolkits' and each /opt package's bin. The program is bound read-only
 * at its path in the containment (./contained-launch.ts programsOf).
 */
const TOOLCHAIN_DIR =
  /^(?:\/usr\/bin|\/bin|\/usr\/sbin|\/sbin|\/usr\/local\/bin|\/usr\/local\/cuda[^/]*\/bin|\/opt\/[^/]+\/bin)$/;

/**
 * Could this process (the agent's user) change `p` or any directory above it?
 * Read from each one's owner and mode (through the view): its own, its
 * group's with group write, or anyone's with other write.
 */
function writableHere(p: string): boolean {
  const uid = process.getuid?.() ?? -1;
  const groups = new Set(process.getgroups?.() ?? []);
  for (let d = p; ; d = path.dirname(d)) {
    let st: fs.Stats;
    try {
      st = viewFs.statSync(d);
    } catch {
      return true; // not known: as if it were
    }
    if (st.uid === uid || st.mode & 0o002 || (st.mode & 0o020 && groups.has(st.gid))) {
      return true;
    }
    if (d === path.dirname(d)) {
      return false;
    }
  }
}

/**
 * `PROG VERSION_ARG`, exactly: PROG a regular executable file in a toolchain
 * directory (the name as written and the file it leads to), which the agent's
 * user can change neither it nor any directory above it. Contained, its run
 * is as safe as any contained run; the program's code is not read.
 */
export function versionProbe(prog: string, args: readonly string[], cwd: string): boolean {
  if (args.length !== 1 || !VERSION_ARGS.has(args[0])) {
    return false;
  }
  let named: string | null = null;
  if (prog.includes("/")) {
    // As written, with no `.`, `..` or empty component (no name taken off without the filesystem).
    named = path.isAbsolute(prog) && !/\/\.{0,2}(?:\/|$)/.test(prog) ? prog : null;
  } else if (/^[A-Za-z0-9._+-]+$/.test(prog)) {
    named = lookupProgram(prog);
  }
  if (!named || !TOOLCHAIN_DIR.test(path.dirname(named))) {
    return false;
  }
  const r = resolveViewPath(cwd, named);
  if (r.kind !== "found" || !TOOLCHAIN_DIR.test(path.dirname(r.real))) {
    return false;
  }
  try {
    const st = viewFs.statSync(r.real);
    if (!st.isFile() || !(st.mode & 0o111)) {
      return false;
    }
  } catch {
    return false;
  }
  return !writableHere(r.real) && !writableHere(named);
}

/** NAME=VALUE in front of a command: it may not change what commands run, except to empty it. */
/** PYTHON* variables that change no code python loads (buffering, encoding, hashing, bytecode writing). */
const PYTHON_INERT_ENV = new Set([
  "PYTHONUNBUFFERED",
  "PYTHONDONTWRITEBYTECODE",
  "PYTHONIOENCODING",
  "PYTHONUTF8",
  "PYTHONHASHSEED",
  "PYTHONFAULTHANDLER",
  "PYTHONNOUSERSITE",
  "PYTHONSAFEPATH",
]);

function checkAssign(name: string, value: string): void {
  // GIT_CONFIG_NOSYSTEM only drops the system configuration: git then starts less, never more.
  if (name === "GIT_CONFIG_NOSYSTEM") {
    return;
  }
  // PYTHON* changes where python finds its own startup code (PYTHONHOME,
  // PYTHONUSERBASE, PYTHONPLATLIBDIR, PYTHONWARNINGS, ...): only the ones that
  // change no code it loads. (The contained python also starts with -E -s.)
  if (/^PYTHON/.test(name) && !PYTHON_INERT_ENV.has(name)) {
    no(`it sets ${name}, which changes the code python loads`);
  }
  // pytest's plugins and options from the environment load code by name.
  if (/^PYTEST_(?:PLUGINS|ADDOPTS)$/.test(name) && value !== "") {
    no(`it sets ${name}, which loads pytest plugins Enclawed does not read`);
  }
  // The locale decides what a shell's patterns and ranges match ([a-f] takes in
  // A-E under a UTF-8 collation); the contained shells run in the C locale.
  if (/^(?:LANG|LANGUAGE|LC_[A-Z_]+|LOCPATH|GLOBIGNORE|CDPATH)$/.test(name)) {
    no(`it sets ${name}, which changes what the shell's patterns match`);
  }
  // PERL* (PERL5OPT, PERL5LIB, PERLLIB, PERL5DB, PERL_*) changes the code perl loads.
  if (name.startsWith("PERL")) {
    no(`it sets ${name}, which changes the code perl loads`);
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
  return cdTarget(c.cwd, c.argv[1]) === null;
}

/**
 * Where `cd DIR` from `cwd` goes, or null when it fails (DIR is no directory).
 * The shell resolves DIR with `..` taken off the name first and, when that
 * fails, as the kernel does; both are resolved here through the view
 * (./view-fs.ts): either leading into the containment's own files refuses the
 * line, and so does a DIR the two read differently.
 */
function cdTarget(cwd: string, dir: string): string | null {
  const named = path.resolve(cwd, dir);
  const forms = [resolveViewPath("/", named), resolveViewPath(cwd, dir)];
  const reach: (string | null)[] = [];
  for (const r of forms) {
    if (r.kind === "refused") {
      no(`cd ${dir.slice(0, 80)}: ${r.why}`);
    }
    let isDir = false;
    if (r.kind === "found") {
      try {
        isDir = viewFs.statSync(r.real).isDirectory();
      } catch {
        isDir = false;
      }
    }
    reach.push(r.kind === "found" && isDir ? r.real : null);
  }
  if (reach[0] !== reach[1]) {
    no(`cd ${dir.slice(0, 80)} leads to different places by name and by its links`);
  }
  return reach[0] === null ? null : named;
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
    c = expandedCommand(scan, c);
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
      // The shell itself opens it: it reads it only as read here (supervisor read pins).
      dataRead(scan, path.resolve(c.cwd, r));
    }
    const [ranBefore, writesBefore, deletesBefore, copiesBefore] = [
      scan.runs,
      scan.writes.size,
      scan.deletes.size,
      scan.copies.size,
    ] as const;
    checkCommand(scan, c, c.argv, set, depth);
    if (scan.runs || scan.writes.size || scan.deletes.size || c.writes?.length) {
      scan.mayCreate = true;
    }
    // What a later script of the line sees may differ from what was read
    // (a redirect whose content the line states is read as the line leaves it).
    if (
      // chmod changes a file's mode, not what it holds.
      c.argv[0] !== "chmod" &&
      ((scan.runs && !ranBefore) ||
        scan.writes.size > writesBefore ||
        scan.deletes.size > deletesBefore ||
        scan.copies.size > copiesBefore ||
        (c.writes ?? []).some(
          (w) => !scan.ctx.overlay?.has(scan.ctx.fs.realpathNearest(path.resolve(c.cwd, w.path))),
        ))
    ) {
      scan.changedFiles = true;
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
  // Every realpath a decision uses goes through the view too (./view-fs.ts).
  const viewCtx: ContainedContext = {
    ...ctx,
    fs: {
      realpathNearest: (p: string) => {
        viewFs.note(p);
        return ctx.fs.realpathNearest(p);
      },
      ...(ctx.fs.gitPrograms
        ? { gitPrograms: (cwd: string) => ctx.fs.gitPrograms?.(cwd) ?? null }
        : {}),
    },
  };
  const scan: Scan = {
    ctx: viewCtx,
    files: new Set(),
    executed: new Set(),
    writes: new Set(),
    runs: false,
    cwd: ctx.projectDir,
    deletes: new Set(),
    mayCreate: false,
    dataReads: new Map(),
    dialect: "dash",
    line: null,
    pos: 0,
    copies: new Map(),
    backedUp: new Set(),
    ranCode: false,
    removed: new Set(),
    stdin: new Set(),
    changedFiles: false,
    shell: new Set(),
    shellText: new Set(),
    gitRefWrites: false,
    buildTools: new Set(),
    buildOutputs: [],
    gitBeyondReadOnly: false,
    systemReads: [],
    modeChanges: new Set(),
  };
  const read = withViewRecord(() => {
    try {
      checkCommands(scan, commands, 0);
      return null;
    } catch (err) {
      if (err instanceof NotContained) {
        return err.message;
      }
      return `it could not be read (${(err as Error)?.message ?? err})`;
    }
  });
  // A path the view refused refuses the line, whatever the reading did with the failed query.
  if (read.refused) {
    return {
      ok: false,
      why: `a path it uses leads into the containment's own files (${read.refused})`,
    };
  }
  if (read.value !== null) {
    return { ok: false, why: read.value };
  }
  // A read-only command that looks at a place outside the project the
  // containment's view does not show (a pinned run shows only its programs; a
  // build also the system and vendor toolchain trees) would answer "no such
  // file" there while the host has it: such a line is not contained.
  const shown = (p: string) =>
    p === "/tmp" ||
    p.startsWith("/tmp/") ||
    ["/dev/null", "/dev/zero", "/dev/urandom", "/dev/stdin", "/dev/stdout", "/dev/stderr"].includes(
      p,
    ) ||
    (scan.buildTools.size > 0 &&
      /^\/(?:usr|opt)(?:\/|$)/.test(p) &&
      !p.startsWith("/usr/local/etc"));
  // Only a path the host has differs: one the host lacks is absent inside too,
  // and the root itself is the view's own (a search from / finds what the run sees).
  const exists = (p: string) => {
    try {
      viewFs.lstatSync(p);
      return true;
    } catch {
      return false;
    }
  };
  const unseen = scan.systemReads.find((p) => p !== "/" && !shown(p) && exists(p));
  if (unseen) {
    return {
      ok: false,
      why: `it reads ${unseen.slice(0, 120)}, which a contained run does not see as the host does`,
    };
  }
  // A contained build keeps git's directory read-only throughout (the name
  // guard refuses every write below a .git): a line that also changes git's
  // state (git add, commit, a branch switch) is not one.
  if (scan.buildTools.size && (scan.gitBeyondReadOnly || scan.gitRefWrites)) {
    return {
      ok: false,
      why: "it runs a build and also changes git's state; a contained build leaves the repository's git files unchanged",
    };
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
    stdin: [...scan.stdin].toSorted(),
    shell: [...scan.shell].toSorted(),
    shellText: [...scan.shellText].toSorted(),
    ...(scan.gitRefWrites ? { gitRefWrites: true as const } : {}),
    ...(scan.buildTools.size
      ? {
          build: {
            tools: [...scan.buildTools].toSorted(),
            outputs: scan.buildOutputs,
          },
        }
      : {}),
    ...(scan.scratchTouched ? { scratch: true as const } : {}),
    modeChanges: [...scan.modeChanges].toSorted(),
    ...(scan.runsCode ? { runsCode: true as const } : {}),
    ...(scan.pythonVenv ? { pythonVenv: scan.pythonVenv } : {}),
    reads: [...scan.dataReads]
      .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([p, sha256]) => ({ path: p, sha256 })),
  };
}

/** A file a shell of the line reads as data: pinned with the content it holds when it is read. */
function dataRead(scan: Scan, file: string): void {
  const real = scan.ctx.fs.realpathNearest(file);
  const later = scan.ctx.overlay?.get(real);
  let bytes: Buffer;
  try {
    bytes = later !== undefined ? Buffer.from(later, "utf8") : viewFs.readBytes(real);
  } catch {
    return; // missing: the shell's open fails, it reads nothing
  }
  scan.dataReads.set(real, createHash("sha256").update(bytes).digest("hex"));
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

/**
 * A directory a tool regenerates, so a snapshot leaves it out: caches always;
 * node_modules only beside a package.json and a lockfile (a package manager
 * installs it again from them). A node_modules anywhere else is the project's own.
 */
function regenerated(parent: string, name: string): boolean {
  if (name !== "node_modules") {
    return REGENERATED.has(name);
  }
  const has = (f: string) => {
    try {
      return viewFs.statSync(path.join(parent, f)).isFile();
    } catch {
      return false;
    }
  };
  return (
    has("package.json") &&
    [
      "package-lock.json",
      "npm-shrinkwrap.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      "bun.lockb",
      "bun.lock",
    ].some(has)
  );
}

export type ProjectSnapshotPlan =
  | Readonly<{
      ok: true;
      files: readonly string[];
      /** Symbolic links git does not keep: their path and target text (history keeps the link itself). */
      links: readonly Readonly<{ path: string; target: string }>[];
    }>
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
  o: Readonly<{
    maxFiles: number;
    maxBytes: number;
    maxFileBytes: number;
    /**
     * A contained build's output directories (real paths) with the entries
     * that mark each as that tool's build tree. One that holds a marker is
     * regenerated by the build: its files git does not track are left out
     * (a tracked file in it is still kept when it differs from HEAD). One
     * without a marker is snapshotted like any directory.
     */
    regenerable?: readonly Readonly<{ dir: string; marker: readonly string[] }>[];
  }>,
): ProjectSnapshotPlan {
  if (!committed) {
    return { ok: false, why: "git's committed tree could not be read" };
  }
  const files: string[] = [];
  const links: { path: string; target: string }[] = [];
  let bytes = 0;
  let seen = 0;
  const regen = new Map((o.regenerable ?? []).map((r) => [r.dir, r.marker]));
  const walk = (dir: string, rel: string, buildTree = false): string | null => {
    let ents: fs.Dirent[];
    try {
      ents = viewFs.readdirEntries(dir);
    } catch {
      return `${dir} could not be listed`;
    }
    const marker = regen.get(dir);
    if (marker && ents.some((e) => marker.includes(e.name))) {
      buildTree = true;
    }
    for (const e of ents) {
      if (++seen > 200_000) {
        return "the project is too large to snapshot";
      }
      const r = rel ? `${rel}/${e.name}` : e.name;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if ((rel === "" && e.name === ".git") || regenerated(dir, e.name)) {
          continue;
        }
        const w = walk(p, r, buildTree);
        if (w) {
          return w;
        }
        continue;
      }
      // A build tree's untracked outputs: the build makes them again.
      if (buildTree && !committed.has(r)) {
        continue;
      }
      if (e.isSymbolicLink()) {
        // The run may replace a link (not change what it points to): history
        // keeps the link's own text, unless git keeps it (as a blob of that text).
        let target: string;
        try {
          target = viewFs.readlink(p);
        } catch {
          return `${r} could not be read`;
        }
        if (committed.get(r) !== gitBlobId(Buffer.from(target))) {
          links.push({ path: p, target });
          if (files.length + links.length > o.maxFiles) {
            return "the project holds more files git does not keep than Enclawed snapshots for one command";
          }
        }
        continue;
      }
      if (!e.isFile()) {
        // A special file (a FIFO, a socket): the run can only replace it, and makes none of these.
        continue;
      }
      let content: Buffer;
      try {
        const st = viewFs.statSync(p);
        if (st.size > o.maxFileBytes) {
          return `${r} is larger than Enclawed's history keeps`;
        }
        // A file with another name (a hard link, maybe outside the project):
        // the containment's name guard refuses every write through it, so it
        // cannot change and needs no snapshot.
        if (st.nlink > 1) {
          continue;
        }
        content = viewFs.readBytes(p);
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
  return why ? { ok: false, why } : { ok: true, files, links };
}
