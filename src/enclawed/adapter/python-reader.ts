// enclawed adapter kit: reading Python before it runs contained.
//
// A Python program (a script, `-c` code, or code a here-document feeds to
// `python3 -`) may run contained with no person only when Enclawed has read
// it, and every project module it imports, and found that it can do nothing
// but read files, write files (the containment keeps writes inside the
// project and snapshots it first) and compute. What it read is then pinned:
// inside the containment only these files, with these bytes, load
// (../containment/code-guard.ts), so the run does not depend on this
// reading being complete.
//
// The reading is a real parse, never a run: the system's python3 (isolated,
// -I -S, started in /) parses the text with `ast` and walks the tree
// (./python-reader-helper.ts). It never imports, compiles or runs the code it
// reads. What it refuses (a whitelist, not a list of bad things):
//
//   - imports of anything but a fixed list of standard-library modules
//     whose import has no effect and whose functions only compute or touch
//     files (re, json, math, collections, pathlib, csv, sqlite3, ...), or of
//     a module of the project, which is read by the same rules and pinned;
//     third-party packages (numpy, requests, ...) are code Enclawed did not
//     read: refused;
//   - of os, sys, shutil, logging, unittest, types and uuid only the listed
//     attributes (os.path, os.environ, os.listdir, os.makedirs, sys.argv,
//     sys.exit, shutil.copy, ...: no program, no deletion, no rename, no
//     link, no sys.modules), and such a module never as a value;
//   - on any object: attributes that start programs, delete, rename or link
//     files, load code or modules by name (system, popen, exec*, spawn*,
//     fork, kill, unlink, rmtree, rename, symlink_to, import_module,
//     get_type_hints, attrgetter, get_field, ...), frame and code internals
//     (f_globals, gi_frame, ...), every way to a frame and every tracing,
//     profiling or monitoring entry point (walk_stack, tb_frame, f_lineno,
//     settrace_all_threads, sys.monitoring, ...: a tracer can make a frame
//     continue at another line), and every double-underscore attribute but
//     a short list of benign ones (__init__, __name__, __enter__, ...), which
//     closes the attribute walks (`().__class__.__bases__[0].__subclasses__()`);
//   - the builtins that run code or reach objects by a computed name: eval,
//     exec, compile, __import__, globals, locals, vars, breakpoint, help;
//     getattr/setattr/delattr only with a literal attribute name that passes
//     the rules above;
//   - string annotations are read as the expressions typing would evaluate;
//   - sys.path changed other than by a literal insert/append; sys.argv and
//     sys.orig_argv changed at all; a path into the containment's own files
//     (/.enclawed, as a literal or a constant expression).
//
// A project module that binds a restricted module (os, sys, ...) is not a way
// around the rules: such a name may not be imported from it, reached through
// it, or star-imported, and a module holding one may not be passed around.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { PY_READER_HELPER } from "./python-reader-helper.js";
import { viewFs } from "./view-fs.js";

/** What the helper reports about one text. */
type Facts =
  | Readonly<{ syntax: string }>
  | Readonly<{ unreadable: string }>
  | Readonly<{
      refusals: readonly (readonly [number, string])[];
      imports: readonly Readonly<{
        module: string;
        level: number;
        names: readonly string[] | null;
        line: number;
        std?: boolean;
      }>[];
      uses: readonly Readonly<{
        module: string;
        name: string | null;
        chain: readonly string[];
        line: number;
        bare?: boolean;
      }>[];
      bindings: Readonly<
        Record<string, Readonly<{ module: string; name?: string; restricted: boolean }>>
      >;
      syspath: readonly (readonly [string, string])[];
      star: readonly string[];
      unittest_main?: boolean;
    }>;

const MAX_TEXT = 512 * 1024;
const cache = new Map<string, Facts | null>();

/**
 * Where the containment looks a program up, in order (../containment/plan.ts
 * PROGRAM_DIRS and lookupProgram; a test keeps the two equal). Kept here so the
 * adapter does not load the containment planner to read code.
 */
export const PYTHON_PROGRAM_DIRS = ["/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"];

function lookupProgram(name: string): string | null {
  if (path.isAbsolute(name)) {
    return viewFs.existsSync(name) ? name : null;
  }
  if (name.includes("/")) {
    return null;
  }
  for (const dir of PYTHON_PROGRAM_DIRS) {
    const p = path.join(dir, name);
    try {
      const st = viewFs.statSync(p);
      if (st.isFile() && st.mode & 0o111) {
        return p;
      }
    } catch {
      /* next */
    }
  }
  return null;
}

/**
 * The interpreter a contained run starts for `name` (a command name, by the
 * containment's own lookup, or an absolute path from a shebang): the reading
 * parses with the interpreter that runs the code, so a text it cannot parse
 * is one that interpreter runs none of. null: no such program.
 */
function pythonProgram(name: string = "python3"): string | null {
  const p = lookupProgram(name);
  if (!p) {
    return null;
  }
  try {
    return viewFs.realpathSync(p);
  } catch {
    return null;
  }
}

/** The oldest Python a contained run takes: the version its guard (../containment/code-guard.ts) is verified on. */
export const CONTAINED_PYTHON_MIN = [3, 14] as const;

type PythonVersion = readonly [number, number];
let versionProbe: ((program: string) => PythonVersion | null) | null = null;
const versions = new Map<string, PythonVersion | null>();

/** Tests: answer the interpreter's version without running it (null: the real probe). */
export function setPythonVersionProbeForTests(
  probe: ((program: string) => PythonVersion | null) | null,
): void {
  versionProbe = probe;
  versions.clear();
}

/**
 * The version of the interpreter binary at `program` (a real path), as that
 * binary reports it when run isolated (cached by the binary's identity: path,
 * size, change time); null: it did not answer.
 */
function pythonVersionOf(program: string): PythonVersion | null {
  if (versionProbe) {
    return versionProbe(program);
  }
  let key = program;
  try {
    const st = viewFs.statSync(program);
    key = `${program}\0${st.size}\0${st.mtimeMs}\0${st.ctimeMs}`;
  } catch {
    return null;
  }
  if (versions.has(key)) {
    return versions.get(key) ?? null;
  }
  const r = spawnSync(
    program,
    ["-I", "-S", "-E", "-c", "import sys;print(sys.version_info[0], sys.version_info[1])"],
    { encoding: "utf8", cwd: "/", env: { PATH: "/usr/bin:/bin" }, timeout: 10_000 },
  );
  const m = r.status === 0 ? /^(\d+) (\d+)\s*$/.exec(r.stdout) : null;
  const v: PythonVersion | null = m ? [Number(m[1]), Number(m[2])] : null;
  versions.set(key, v);
  return v;
}

/** What contained Python needs from the interpreter the containment would start for `interpreter`. */
export type ContainedPythonStatus = Readonly<{
  program: string | null;
  version: PythonVersion | null;
  /** null: contained Python runs with it; otherwise why not (for a person). */
  unsupported: string | null;
}>;

export function containedPythonStatus(interpreter: string = "python3"): ContainedPythonStatus {
  const program = pythonProgram(interpreter);
  if (!program) {
    return { program, version: null, unsupported: null };
  }
  const version = pythonVersionOf(program);
  const [maj, min] = CONTAINED_PYTHON_MIN;
  if (!version) {
    return {
      program,
      version,
      unsupported: `contained Python needs Python ${maj}.${min} or newer; Enclawed could not tell the version of ${program}`,
    };
  }
  if (version[0] < maj || (version[0] === maj && version[1] < min)) {
    return {
      program,
      version,
      unsupported: `contained Python needs Python ${maj}.${min} or newer; this host has ${version[0]}.${version[1]}`,
    };
  }
  return { program, version, unsupported: null };
}

/** The helper's facts about a Python text (cached by content); null: it could not be read. */
export function pythonFacts(text: string, interpreter: string = "python3"): Facts | null {
  const prog = pythonProgram(interpreter);
  // Text that did not decode as UTF-8 is not what the interpreter reads: not read.
  if (text.length > MAX_TEXT || text.includes("\uFFFD") || !prog) {
    return null;
  }
  const key = `${prog}\0${createHash("sha256").update(text).digest("hex")}`;
  if (cache.has(key)) {
    return cache.get(key) ?? null;
  }
  const r = spawnSync(prog, ["-I", "-S", "-E", "-B", "-c", PY_READER_HELPER], {
    input: text,
    encoding: "utf8",
    cwd: "/",
    env: { PATH: "/usr/bin:/bin", LC_ALL: "C.UTF-8" },
    timeout: 10_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  let facts: Facts | null = null;
  if (r.status === 0) {
    try {
      facts = JSON.parse(r.stdout) as Facts;
    } catch {
      facts = null;
    }
  }
  if (cache.size > 4096) {
    cache.clear();
  }
  cache.set(key, facts);
  return facts;
}

let pathInfo: { dirs: string[]; builtins: Set<string> } | null | undefined;

/**
 * Whether python3 could import a module by this name from its own path
 * (standard library, lib-dynload, dist- and site-packages; not the user's
 * site-packages, which a contained run does not see) or as a built-in. Not
 * known (python3 cannot tell): taken to exist.
 */
function moduleExistsOutside(name: string, siteDirs: readonly string[] = []): boolean {
  for (const d of siteDirs) {
    let names: string[] = [];
    try {
      names = viewFs.readdirNames(d);
    } catch {
      continue;
    }
    if (names.some((n) => n === name || n.startsWith(`${name}.`))) {
      return true;
    }
  }
  if (pathInfo === undefined) {
    const r = spawnSync(
      pythonProgram() ?? "python3",
      ["-I", "-c", "import sys,json;print(json.dumps([sys.path,list(sys.builtin_module_names)]))"],
      { encoding: "utf8", cwd: "/", env: { PATH: "/usr/bin:/bin" }, timeout: 10_000 },
    );
    try {
      const [dirs, builtins] = JSON.parse(r.stdout) as [string[], string[]];
      pathInfo = { dirs: dirs.filter((d) => path.isAbsolute(d)), builtins: new Set(builtins) };
    } catch {
      pathInfo = null;
    }
  }
  if (!pathInfo || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || pathInfo.builtins.has(name)) {
    return true;
  }
  for (const d of pathInfo.dirs) {
    let names: string[] = [];
    try {
      names = viewFs.readdirNames(d);
    } catch {
      continue;
    }
    if (names.some((n) => n === name || n.startsWith(`${name}.`))) {
      return true;
    }
  }
  return false;
}

/** What the reader needs from its caller (./contained-exec.ts): reading and checking project files. */
export type PythonReaderIO = Readonly<{
  /**
   * Read a module file the program imports: its real path and text (the
   * caller pins it). Throws when it may not be read (outside the project, too large).
   */
  load: (file: string) => { real: string; text: string };
  /** The caller's checks of every module's text (paths it names, secrets, literal writes); throws to refuse. */
  checkText: (text: string, what: string) => void;
  /** Where relative sys.path entries resolve (the run's working directory). */
  cwd: string;
  /** A name for a file in messages (project-relative). */
  show: (file: string) => string;
  /** Where a path the run sees is on this host (the session's /tmp); identity elsewhere. */
  hostPath?: (p: string) => string;
  /** The arguments the program is run with (sys.argv[1:]): unittest.main reads test names there. */
  programArgs?: readonly string[];
  /** The interpreter that runs it: a command name (python3, python) or a shebang's absolute path. */
  interpreter?: string;
  /** A virtual environment's site-packages the run sees: modules there are code Enclawed does not read. */
  siteDirs?: readonly string[];
  /** Top-level modules of the runner itself (pytest for a pytest run): its tests may import them. */
  runnerModules?: readonly string[];
}>;

type Module = {
  real: string;
  /** Package directory when this is a package's __init__.py. */
  pkgDir: string | null;
  facts: Extract<Facts, { refusals: unknown }>;
  /** Dotted name it was imported as (for submodules), or null for the program itself. */
  name: string | null;
};

class Refused extends Error {}
function refuse(why: string): never {
  throw new Refused(why);
}

/**
 * Read a Python program and everything of the project it imports. Returns
 * null when it may run contained (the files it read went through io.load),
 * or why not.
 *
 * `file`: the program's file (null for -c or standard-input code);
 * `dirs`: Python's first module path entries for it (the script's
 * directory, the working directory for -c and standard input; none when isolated).
 */
export function readPython(
  text: string,
  what: string,
  file: string | null,
  dirs: readonly string[],
  io: PythonReaderIO,
): string | null {
  const st = {
    io,
    searched: [...dirs],
    byReal: new Map<string, Module>(),
    byName: new Map<string, Module>(),
  };
  // The interpreter the containment would start (its real binary's own answer):
  // older than the guard is verified on, nothing runs contained.
  const unsupported = containedPythonStatus(io.interpreter ?? "python3").unsupported;
  if (unsupported) {
    return unsupported;
  }
  const outer = hostOf;
  hostOf = io.hostPath ?? ((p) => p);
  try {
    const entry = readModule(st, text, what, file, null);
    for (const m of new Set([entry, ...st.byReal.values()])) {
      useCheck(st, m);
    }
    return null;
  } catch (err) {
    if (err instanceof Refused) {
      return err.message;
    }
    throw err;
  } finally {
    hostOf = outer;
  }
}

type State = {
  io: PythonReaderIO;
  searched: string[];
  byReal: Map<string, Module>;
  byName: Map<string, Module>;
};

function factsOf(text: string, what: string, interpreter: string): Module["facts"] {
  const f = pythonFacts(text, interpreter);
  if (!f) {
    refuse(`${what} could not be read as Python`);
  }
  if ("unreadable" in f) {
    refuse(`${what}: ${f.unreadable}`);
  }
  if ("syntax" in f) {
    // python3 compiles the whole file first: a text it cannot parse runs none of it.
    return { refusals: [], imports: [], uses: [], bindings: {}, syspath: [], star: [] };
  }
  const first = f.refusals[0];
  if (first) {
    refuse(`${what}, line ${first[0]}: ${first[1]}`);
  }
  return f;
}

// The host mapping of the reading in progress (readPython is synchronous).
let hostOf: (p: string) => string = (p) => p;

function isFile(p: string): boolean {
  try {
    return viewFs.statSync(hostOf(p)).isFile();
  } catch {
    return false;
  }
}

function isDir(p: string): boolean {
  try {
    return viewFs.statSync(hostOf(p)).isDirectory();
  } catch {
    return false;
  }
}

/** Compiled or packaged module forms Python would load and Enclawed cannot read. */
function compiledFormIn(dir: string, name: string): boolean {
  let names: string[] = [];
  try {
    names = viewFs.readdirNames(hostOf(dir));
  } catch {
    return false;
  }
  return names.some(
    (n) =>
      n === `${name}.pyc` ||
      n === `${name}.pyw` ||
      n === `${name}.pth` ||
      (n.startsWith(`${name}.`) && /\.(?:so|pyd)$/.test(n)) ||
      n === `${name}.zip`,
  );
}

/**
 * The file a module part resolves to in `dir`: a .py file or a package's
 * __init__.py; { file: null } for a directory without __init__.py (a
 * namespace package part, whose other parts may be anywhere on the path,
 * the toolchain's included); null: not there.
 */
function moduleFileIn(
  dir: string,
  name: string,
): { file: string; pkgDir: string | null } | { file: null; pkgDir: string } | null {
  const pkg = path.join(dir, name);
  if (isDir(pkg)) {
    const init = path.join(pkg, "__init__.py");
    if (isFile(init)) {
      return { file: init, pkgDir: pkg };
    }
    if (isFile(`${pkg}.py`)) {
      return { file: `${pkg}.py`, pkgDir: null };
    }
    return { file: null, pkgDir: pkg };
  }
  if (isFile(`${pkg}.py`)) {
    return { file: `${pkg}.py`, pkgDir: null };
  }
  if (compiledFormIn(dir, name)) {
    refuse(`it imports ${name}, a compiled module Enclawed cannot read`);
  }
  return null;
}

function load(st: State, file: string, pkgDir: string | null, name: string | null): Module {
  const { real, text } = st.io.load(file);
  const known = st.byReal.get(real);
  if (known) {
    if (name && !st.byName.has(name)) {
      st.byName.set(name, known);
    }
    return known;
  }
  return readModule(st, text, st.io.show(real), real, pkgDir, name);
}

function readModule(
  st: State,
  text: string,
  what: string,
  real: string | null,
  pkgDir: string | null,
  name: string | null = null,
): Module {
  st.io.checkText(text, what);
  const facts = factsOf(text, what, st.io.interpreter ?? "python3");
  if (facts.unittest_main && (st.io.programArgs ?? []).some((a) => !a.startsWith("-"))) {
    refuse(`${what} runs unittest.main, which loads the tests its arguments name`);
  }
  const mod: Module = { real: real ?? "", pkgDir, facts, name };
  if (real) {
    st.byReal.set(real, mod);
  }
  if (name) {
    st.byName.set(name, mod);
  }
  // sys.path changed by literal directories: searched as Python searches them.
  for (const [op, dir] of facts.syspath) {
    const d = path.resolve(st.io.cwd, dir || ".");
    // Only a directory there now: an archive (.zip, .egg, .whl), a file or a path
    // that does not exist yet would hold code Enclawed cannot read.
    if (!isDir(d)) {
      refuse(`${what} puts ${dir || "."} on sys.path, which is not a directory Enclawed reads`);
    }
    if (op === "insert") {
      st.searched.unshift(d);
    } else {
      st.searched.push(d);
    }
  }
  const here = real ? path.dirname(real) : null;
  for (const imp of facts.imports) {
    if (imp.level > 0) {
      if (!here) {
        refuse(`${what} has a relative import outside a package`);
      }
      let base = pkgDir ?? here;
      for (let i = 1; i < imp.level; i++) {
        base = path.dirname(base);
      }
      const parts = imp.module ? imp.module.split(".") : [];
      const target = importParts(st, base, parts, `.${imp.module}`, what, true);
      fromNames(st, target, imp.names ?? []);
      continue;
    }
    const parts = imp.module.split(".");
    let found: Module | null = null;
    for (const d of st.searched) {
      const first = moduleFileIn(d, parts[0]);
      if (first?.file === null) {
        if (imp.std) {
          continue; // a module found later on the path wins over a namespace part
        }
        refuse(`${what} imports ${parts[0]}, a directory Enclawed does not read as a module`);
      }
      if (first) {
        if (imp.std) {
          // The helper read its uses as the standard library's module.
          refuse(`${what} imports ${parts[0]}, which a project file shadows`);
        }
        found = importParts(st, d, parts, imp.module, what, false);
        break;
      }
    }
    if (!found) {
      if (imp.std) {
        continue; // the standard library's module (the helper checked its use)
      }
      if (st.io.runnerModules?.includes(parts[0])) {
        continue; // the runner's own module (pytest for its tests): toolchain code
      }
      if (moduleExistsOutside(parts[0], st.io.siteDirs ?? [])) {
        refuse(`${what} imports ${imp.module}, a module whose code Enclawed does not read`);
      }
      continue; // no such module anywhere: the import fails and loads nothing
    }
    if (imp.names) {
      fromNames(st, found, imp.names);
    }
  }
  return mod;
}

/** Load a.b.c from `base` (each package's __init__ and the last part), returning the last module. */
function importParts(
  st: State,
  base: string,
  parts: readonly string[],
  dotted: string,
  what: string,
  relative: boolean,
): Module {
  let dir = base;
  let mod: Module | null = null;
  if (parts.length === 0) {
    // `from . import x`: the package itself.
    const init = path.join(base, "__init__.py");
    if (!isFile(init)) {
      refuse(`${what} imports from a package Enclawed does not read`);
    }
    return load(st, init, base, null);
  }
  const names: string[] = [];
  for (const p of parts) {
    names.push(p);
    const at = moduleFileIn(dir, p);
    if (!at || at.file === null) {
      refuse(`${what} imports ${dotted}, which Enclawed cannot find in the project as a module`);
    }
    mod = load(st, at.file, at.pkgDir, relative ? null : names.join("."));
    if (at.pkgDir === null) {
      if (names.length < parts.length) {
        refuse(`${what} imports ${dotted}, below a module that is not a package`);
      }
      break;
    }
    dir = at.pkgDir;
  }
  return mod as Module;
}

/** `from M import a, b`: a submodule of a package is read too; a restricted binding of M is refused. */
function fromNames(st: State, mod: Module, names: readonly string[]): void {
  for (const n of names) {
    if (n === "*") {
      if (tainted(st, mod, new Set())) {
        refuse(
          `it imports everything from ${st.io.show(mod.real)}, which holds a restricted module`,
        );
      }
      continue;
    }
    const b = mod.facts.bindings[n];
    if (b?.restricted) {
      refuse(`it imports ${n} from ${st.io.show(mod.real)}, which is the module ${b.module}`);
    }
    if (mod.pkgDir) {
      const sub = moduleFileIn(mod.pkgDir, n);
      if (sub?.file) {
        load(st, sub.file, sub.pkgDir, null);
      }
    }
  }
}

/** Whether a module holds (or reaches through its project modules) a restricted module. */
function tainted(st: State, mod: Module, seen: Set<Module>): boolean {
  if (seen.has(mod)) {
    return false;
  }
  seen.add(mod);
  for (const b of Object.values(mod.facts.bindings)) {
    if (b.restricted) {
      return true;
    }
    const target = targetOf(st, mod, b.module, b.name ?? null);
    if (target && tainted(st, target, seen)) {
      return true;
    }
  }
  if (mod.pkgDir) {
    for (const m of st.byReal.values()) {
      if (m !== mod && isInside(mod.pkgDir, m.real) && tainted(st, m, seen)) {
        return true;
      }
    }
  }
  return false;
}

function isInside(dir: string, p: string): boolean {
  const rel = path.relative(dir, p);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** The project module a binding of `mod` stands for (module, or module + name that is a submodule), or null. */
function targetOf(st: State, mod: Module, module: string, name: string | null): Module | null {
  let m: Module | null = null;
  if (module.startsWith(".")) {
    const level = module.length - module.replace(/^\.+/, "").length;
    let base = mod.pkgDir ?? path.dirname(mod.real);
    for (let i = 1; i < level; i++) {
      base = path.dirname(base);
    }
    const rest = module.slice(level);
    const file = rest
      ? [
          path.join(base, ...rest.split("."), "__init__.py"),
          `${path.join(base, ...rest.split("."))}.py`,
        ].find(isFile)
      : path.join(base, "__init__.py");
    m = file ? (st.byReal.get(file) ?? null) : null;
  } else {
    m = st.byName.get(module) ?? null;
  }
  if (m && name !== null) {
    if (m.pkgDir) {
      const sub = [
        path.join(m.pkgDir, name, "__init__.py"),
        path.join(m.pkgDir, `${name}.py`),
      ].find(isFile);
      const sm = sub ? st.byReal.get(sub) : undefined;
      if (sm) {
        return sm;
      }
    }
    const b = m.facts.bindings[name];
    return b && !b.restricted ? targetOf(st, m, b.module, b.name ?? null) : null;
  }
  return m;
}

/**
 * Every use of a name imported from a project module: an attribute chain
 * through it may not reach a restricted binding, and a module that holds one
 * (itself or through its project modules) may not be used as a value.
 */
function useCheck(st: State, mod: Module): void {
  for (const u of mod.facts.uses) {
    let cur = targetOf(st, mod, u.module, null);
    if (!cur) {
      continue; // not a project module (the standard library: the helper checked it)
    }
    const chain = u.name !== null ? [u.name, ...u.chain] : [...u.chain];
    let i = 0;
    for (; i < chain.length && cur; i++) {
      const a = chain[i];
      const b: Module["facts"]["bindings"][string] | undefined = cur.facts.bindings[a];
      if (b?.restricted) {
        refuse(
          `${st.io.show(mod.real || "the code")}, line ${u.line}: it reaches the module ${b.module} through ${st.io.show(cur.real)}`,
        );
      }
      cur = nextOf(st, cur, a);
    }
    if (u.bare && i === chain.length && cur && tainted(st, cur, new Set())) {
      refuse(
        `${st.io.show(mod.real || "the code")}, line ${u.line}: it passes around ${st.io.show(cur.real)}, which holds a restricted module`,
      );
    }
  }
}

/** The project module `cur.a` stands for (a submodule or a binding to a project module), or null. */
function nextOf(st: State, cur: Module, a: string): Module | null {
  if (cur.pkgDir) {
    const sub = [path.join(cur.pkgDir, a, "__init__.py"), path.join(cur.pkgDir, `${a}.py`)].find(
      isFile,
    );
    const sm = sub ? st.byReal.get(sub) : undefined;
    if (sm) {
      return sm;
    }
  }
  const b = cur.facts.bindings[a];
  return b && !b.restricted ? targetOf(st, cur, b.module, b.name ?? null) : null;
}
