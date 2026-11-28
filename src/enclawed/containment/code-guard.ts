// Code pins (M1): a contained run that was offered containment because
// Enclawed read what it runs (../adapter/contained-exec.ts) loads and executes
// no other code from the project or a writable place. The containment
// enforces it, so the run does not depend on the reading being complete:
//
//   native code   every writable mount (the project, /tmp, the sandbox home,
//                 /dev/shm) is noexec: no program, shared library or native
//                 addon from a writable place is executed or mapped. Under
//                 the python wrapper executable memory the run could have
//                 written is refused too (./name-guard.c python_wx_filter:
//                 anonymous or writable executable mappings, mprotect to
//                 executable, memfd_create); node keeps its JIT, and
//                 memfd_create is refused for every process only in strict
//                 plans (./seccomp.ts).
//                 A file the line runs directly (by its shebang) is bound
//                 executable on its own.
//   node          the program the view shows as node is a wrapper that starts
//                 the real binary with the guard preloaded first
//                 (--require, before anything else of the run) and code
//                 generation from strings off. The guard's module hooks
//                 (module.registerHooks: require and import alike) load a
//                 file outside the toolchain only when it is one Enclawed
//                 read and its bytes hash to what was read; the bytes checked
//                 are the bytes compiled. data: URLs, vm, WebAssembly, an
//                 inspector session, hooks or a compile cache of the run's
//                 own, process.dlopen of a writable file, eval workers and
//                 node options that load other code first (a loader, a
//                 preload) are refused.
//   python        the program the view shows as python is a wrapper that
//                 starts the real interpreter on the guard, which installs an
//                 audit hook (it cannot be removed) before the run's code:
//                 code compiled from a file outside the toolchain must be a
//                 file Enclawed read with the bytes it read; code built at run
//                 time (exec, eval, compile of a string, marshal, a code
//                 object made by hand) is refused unless the toolchain itself
//                 builds it (dataclasses, namedtuple); cached bytecode is
//                 never read from a writable place and never written; a
//                 shared library from a writable place is refused.
//   other         an interpreter the guard does not cover (perl, ruby, php,
//                 ...) is not started with code pins: such a plan is refused,
//                 the command then asks the person.
//
// The toolchain: every path the view binds read-only outside the writable
// roots (the programs, their libraries and runtime data, the declared
// read-only roots), and the guard's own directory.

/** Where the guards live in the view (read-only, on the view's own tmpfs). */
export const CODE_GUARD_DIR = "/.enclawed/code";
export const NODE_GUARD_PATH = `${CODE_GUARD_DIR}/node-guard.cjs`;
export const PY_GUARD_PATH = `${CODE_GUARD_DIR}/py-guard.py`;
/** Python's bytecode cache prefix in the view: an empty read-only directory. */
export const PY_CACHE_PREFIX = `${CODE_GUARD_DIR}/pyc`;

export type CodePin = Readonly<{
  path: string;
  sha256: string;
  exec: boolean;
  /** A shell script: the contained shell runs this content (base64, its SHA-256 is `sha256`) in its place. */
  shell?: true;
  contentBase64?: string;
}>;

/** Where the contained shell's copies of the scripts Enclawed read live in the view. */
export const SHELL_COPY_DIR = "/.enclawed/code/sh";

/** Shells the shell guard wraps, by the basename of the real program. */
export function guardedShell(realBase: string): boolean {
  return realBase === "sh" || realBase === "dash" || realBase === "bash";
}

/** awk is GNU awk here: started with --sandbox (no system(), no redirection, no getline from files). */
export function guardedAwk(realBase: string): boolean {
  return realBase === "gawk";
}

/**
 * The wrappers' configuration in the view (read by the name guard in its
 * wrapper mode, ./name-guard.c): the wrapped programs, the -c texts and script
 * copies a shell may run, the places a run can write, python's and node's
 * guard options.
 */
export const WRAPPERS_CONF_PATH = "/.enclawed/code/wrappers.conf";

/** The options node always starts with in a contained run: the guard first. */
export const NODE_GUARD_OPTIONS = `--require=${NODE_GUARD_PATH} --disallow-code-generation-from-strings`;

/** Interpreters the guards cover, by the basename of the real program. */
export function guardedInterpreter(realBase: string): "node" | "python" | null {
  if (realBase === "node" || realBase === "nodejs") {
    return "node";
  }
  if (/^python3(?:\.\d+)?$/.test(realBase)) {
    return "python";
  }
  return null;
}

/** Programs that load code from files and have no guard: not started with code pins. */
export const UNGUARDED_INTERPRETERS =
  /^(?:perl[\d.]*|ruby[\d.]*|php[\d.]*|lua[\d.]*|luajit|tclsh[\d.]*|wish[\d.]*|deno|bun|python2(?:\.\d+)?|python|pypy\d*|R|Rscript|julia|java|jshell|guile[\d.]*|racket|sbcl|ghci|runghc|osascript|pwsh|powershell|ts-node|tsx|irb|erl|escript|elixir|iex|swipl|gst|ocaml|scala)$/;

/** node's own test reporters: the only reporters not read as a file. */
const NODE_BUILTIN_REPORTERS_GUARD = ["spec", "tap", "dot", "junit", "lcov"];

/** Options of NODE_ARGS_OK that take a value (checked by the guard's valueOk). */
const NODE_VALUED_GUARD = [
  "--test-reporter",
  "--test-reporter-destination",
  "--test-name-pattern",
  "--test-skip-pattern",
  "--test-concurrency",
  "--test-timeout",
  "--test-isolation",
  "--input-type",
];

/** The node options the guard accepts besides its own (the forms ../adapter/contained-exec.ts reads). */
const NODE_ARGS_OK = [
  "--test",
  "--test-only",
  "--test-force-exit",
  "--no-warnings",
  "--enable-source-maps",
  "--trace-warnings",
  "--experimental-test-coverage",
  "--check",
  "-c",
  "--test-reporter",
  "--test-reporter-destination",
  "--test-name-pattern",
  "--test-skip-pattern",
  "--test-concurrency",
  "--test-timeout",
  "--test-isolation",
  "--input-type",
  "-e",
  "--eval",
  "-p",
  "--print",
  "--disallow-code-generation-from-strings",
];

const json = (v: unknown) => JSON.stringify(v);

/** The node guard: preloaded first into every node process of the run. */
export function nodeGuardSource(
  pins: readonly CodePin[],
  toolchain: readonly string[],
  execPaths: readonly Readonly<{ view: string; host: string }>[] = [],
): string {
  return `// Enclawed code pins: node guard (generated). Loaded first; see the kit's
// containment/code-guard.ts.
"use strict";
(() => {
  // node runs from an execute-only copy the view does not show: its own path,
  // for the run, is the guarded program's (so a node it starts goes through
  // the wrapper again).
  {
    const EXEC_PATHS = new Map(${json(execPaths.map((e) => [e.host, e.view]))});
    const v = EXEC_PATHS.get(process.execPath);
    if (v) {
      Object.defineProperty(process, "execPath", { value: v, writable: false, configurable: false, enumerable: true });
    }
  }
  const PINS = new Map(${json(pins.map((p) => [p.path, p.sha256]))});
  const TOOLCHAIN = ${json(toolchain)};
  const ARGS_OK = new Set(${json(NODE_ARGS_OK)});
  const VALUED = ${json(NODE_VALUED_GUARD)};
  const GUARD = ${json(NODE_GUARD_PATH)};
  const fs = require("node:fs");
  const crypto = require("node:crypto");
  const Module = require("node:module");
  const fail = (msg) => {
    try {
      fs.writeSync(2, "Enclawed: " + msg + "\\n");
    } catch {}
    process.exit(126);
  };
  if (typeof Module.registerHooks !== "function" || typeof crypto.hash !== "function") {
    fail("this node has no module hooks, so the code it loads cannot be checked; nothing was run");
  }
  // What the checks use at run time is taken now, before the run's code can
  // replace any of it (prototypes, fs functions, globals, the URL class's
  // accessors, Error.prepareStackTrace): no check calls a method by its name.
  const E = Error;
  const capture = E.captureStackTrace;
  const apply = Reflect.apply;
  const isArray = Array.isArray;
  const strStarts = String.prototype.startsWith;
  const strIndexOf = String.prototype.indexOf;
  const strSlice = String.prototype.slice;
  const strCode = String.prototype.charCodeAt;
  const slice = Array.prototype.slice;
  const arrIncludes = Array.prototype.includes;
  const mapGet = Map.prototype.get;
  const mapHas = Map.prototype.has;
  const gopd = Object.getOwnPropertyDescriptor;
  const defineProp = Object.defineProperty;
  const ownKeys = Reflect.ownKeys;
  const createObj = Object.create;
  const realpath0 = fs.realpathSync;
  const readFile0 = fs.readFileSync;
  const hash0 = crypto.hash;
  const bufFrom = Buffer.from;
  const decode0 = decodeURIComponent;
  const execPath = process.execPath;
  const pathResolve = require("node:path").resolve;
  const cwd0 = process.cwd;
  const starts = (s, p) => apply(strStarts, s, [p]);
  const has = (s, p) => apply(strIndexOf, s, [p]) >= 0;
  const realOf = (p) => {
    try {
      return apply(realpath0, fs, [p]);
    } catch {
      return p;
    }
  };
  const trusted = (p) => {
    for (let i = 0; i < TOOLCHAIN.length; i++) {
      const d = TOOLCHAIN[i];
      if (p === d || starts(p, d[d.length - 1] === "/" ? d : d + "/")) return true;
    }
    return false;
  };
  const sha = (b) => apply(hash0, crypto, ["sha256", b, "hex"]);
  const digits = (v) => {
    if (v === "") return false;
    for (let i = 0; i < v.length; i++) {
      const c = apply(strCode, v, [i]);
      if (c < 48 || c > 57) return false;
    }
    return true;
  };
  // A value option's value: a reporter is code (node's own, or a file Enclawed
  // read, never one of the toolchain's by path); a destination is standard
  // output or error, or a file outside the toolchain; the rest plain values.
  const BUILTIN_REPORTERS = ${json([...NODE_BUILTIN_REPORTERS_GUARD])};
  const valueOk = (name, v, base) => {
    if (typeof v !== "string") return false;
    if (name === "--test-reporter") {
      if (apply(arrIncludes, BUILTIN_REPORTERS, [v])) return true;
      const real = realOf(apply(pathResolve, null, [base, v]));
      return apply(mapHas, PINS, [real]) && !trusted(real);
    }
    if (name === "--test-reporter-destination") {
      if (v === "stdout" || v === "stderr") return true;
      return !trusted(realOf(apply(pathResolve, null, [base, v])));
    }
    if (name === "--test-concurrency" || name === "--test-timeout") return digits(v);
    if (name === "--input-type") return v === "module" || v === "commonjs";
    if (name === "--test-isolation") return v === "process" || v === "none";
    return true;
  };
  // Options that load other code before or around the guard are refused. Whether
  // node runs -e/-p code as CommonJS is noted: only then does node compile its one
  // eval wrapper, before any of the run's code.
  let evalCjs = false;
  {
    const xa = process.execArgv;
    let evalCode = false;
    let inputModule = false;
    for (let i = 0; i < xa.length; i++) {
      const a = xa[i];
      const eq = a.indexOf("=");
      const name = eq > 0 ? a.slice(0, eq) : a;
      if (a === "--require=" + GUARD || a === GUARD) continue;
      if (!a.startsWith("-")) continue;
      if (!ARGS_OK.has(name)) {
        fail("node " + name + " is not an option this contained run takes (it may load code Enclawed did not read); nothing was run");
      }
      if (name === "-e" || name === "--eval" || name === "-p" || name === "--print") {
        evalCode = true;
        if (eq < 0) i++;
        continue;
      }
      if (VALUED.includes(name)) {
        const v = eq > 0 ? a.slice(eq + 1) : xa[++i];
        if (!valueOk(name, v, process.cwd())) {
          fail("node " + name + " " + String(v).slice(0, 80) + " is not a value this contained run takes; nothing was run");
        }
        if (name === "--input-type" && v === "module") inputModule = true;
      }
    }
    evalCjs = evalCode && !inputModule;
  }
  class CodeNotRead extends Error {
    constructor(what, why) {
      super("Enclawed: " + what + " was not loaded: " + why + " (this contained run loads only the code Enclawed read)");
      this.code = "ERR_ENCLAWED_CODE_NOT_READ";
    }
  }
  // A file: URL's path, decoded here (the URL class's accessors are the run's
  // to replace): no host, no query or fragment, no encoded slash or NUL.
  const pathOf = (u) => {
    if (typeof u !== "string" || !starts(u, "file:///")) throw new CodeNotRead(String(u).slice(0, 80), "it is not a local file: URL");
    let s = apply(strSlice, u, [7]);
    let i = apply(strIndexOf, s, ["#"]);
    if (i >= 0) s = apply(strSlice, s, [0, i]);
    i = apply(strIndexOf, s, ["?"]);
    if (i >= 0) s = apply(strSlice, s, [0, i]);
    if (has(s, "%2f") || has(s, "%2F") || has(s, "%00")) throw new CodeNotRead(u, "its path is not a plain file path");
    return decode0(s);
  };
  // A file outside the toolchain must be one Enclawed read, with the bytes it
  // read: those bytes (null for a toolchain file).
  const pinned = (p) => {
    const real = realOf(p);
    if (trusted(real)) return null;
    const want = apply(mapGet, PINS, [real]);
    if (want === undefined) throw new CodeNotRead(p, "it is not one of the files Enclawed read");
    const buf = apply(readFile0, fs, [real]);
    if (sha(buf) !== want) throw new CodeNotRead(p, "its content is not what Enclawed read");
    return buf;
  };
  // Every file node loads is compiled from the bytes read here: a pinned file's
  // checked bytes, a toolchain file's own (never what node's default loader
  // would read through accessors the run may have replaced).
  Module.registerHooks({
    load(url, context, nextLoad) {
      if (typeof url !== "string" || starts(url, "data:")) {
        throw new CodeNotRead("a data: URL", "code built at run time is not loaded");
      }
      if (!starts(url, "file:")) {
        return nextLoad(url, context);
      }
      const p = pathOf(url);
      const buf = pinned(p);
      const source = buf === null ? apply(readFile0, fs, [realOf(p)]) : buf;
      const r = nextLoad(url, context);
      if (r.format === "addon" || r.format === "wasm") {
        // Native or wasm code: only the bytes read (and a native addon cannot map from a noexec place).
        return { ...r, source, shortCircuit: true };
      }
      return { format: r.format, source, shortCircuit: true };
    },
  });
  // The hooks above are the only ones, and node's module wrapper stays node's:
  // the run's code registers no other hook (in-thread or off-thread) and turns
  // on no compile cache, by whatever way it reaches node:module (require,
  // import, getBuiltinModule, an alias); the import namespace shows the same.
  const lock = (obj, k, what) => {
    if (!(k in obj)) return;
    const refuse = function () {
      throw new CodeNotRead(what, "the run's code does not change how node loads or builds code");
    };
    try {
      defineProp(obj, k, { value: refuse, writable: false, configurable: false });
    } catch {}
    if (obj[k] !== refuse) fail(what + " could not be closed; nothing was run");
  };
  for (const k of ["registerHooks", "register", "enableCompileCache"]) lock(Module, k, "module." + k);
  const wrap0 = Module.wrap;
  const wrapper0 = Module.wrapper;
  const W = [wrapper0[0], wrapper0[1]];
  const wrapperSame = () => {
    if (Module.wrap !== wrap0 || Module.wrapper !== wrapper0) return false;
    for (let i = 0; i < 2; i++) {
      const d = apply(gopd, Object, [wrapper0, "" + i]);
      if (d === undefined || "get" in d || "set" in d || d.value !== W[i]) return false;
    }
    return true;
  };
  // node -e / -p compile one wrapper of their (read) code, under this name, before any of the run's code.
  const evalName = (f) => {
    if (!starts(f, "[eval")) return false;
    let i = 5;
    while (i < f.length && apply(strCode, f, [i]) >= 48 && apply(strCode, f, [i]) <= 57) i++;
    if (apply(strCode, f, [i]) !== 93) return false;
    const rest = apply(strSlice, f, [i + 1]);
    return rest === "" || rest === "-wrapper";
  };
  let evalSeen = !evalCjs;
  // A module compiled by hand is checked the same way: a pinned file's bytes
  // under its name, a toolchain file's own bytes under its name.
  const compile = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (typeof content !== "string" || typeof filename !== "string") {
      throw new CodeNotRead("code built at run time", "it is not a file Enclawed read");
    }
    if (!wrapperSame()) throw new CodeNotRead(filename, "node's module wrapper was changed");
    if (!evalSeen && evalName(filename)) {
      evalSeen = true;
      return apply(compile, this, arguments);
    }
    if (!starts(filename, "/")) throw new CodeNotRead("code built at run time", "it is not a file Enclawed read");
    const real = realOf(filename);
    let want = apply(mapGet, PINS, [real]);
    if (trusted(real)) {
      try {
        want = sha(apply(readFile0, fs, [real]));
      } catch {
        want = undefined;
      }
    }
    const got = sha(apply(bufFrom, Buffer, [content, "utf8"]));
    const gotBom = sha(apply(bufFrom, Buffer, ["\\ufeff" + content, "utf8"]));
    if (want === undefined || (got !== want && gotBom !== want)) {
      throw new CodeNotRead(filename, want ? "its content is not what Enclawed read" : "it is not one of the files Enclawed read");
    }
    return apply(compile, this, arguments);
  };
  const dlopen = process.dlopen;
  process.dlopen = function (module, filename) {
    if (typeof filename !== "string") throw new CodeNotRead("a native addon", "its name is not a file Enclawed read");
    pinned(filename);
    return apply(dlopen, this, arguments);
  };
  // vm compiles strings into code, and an inspector session evaluates them: refused here.
  const vm = require("node:vm");
  for (const k of ownKeys(vm)) {
    if (typeof k === "string" && typeof vm[k] === "function" && k !== "isContext" && k !== "measureMemory") lock(vm, k, "vm." + k);
  }
  for (const name of ["node:inspector", "node:inspector/promises"]) {
    let m = null;
    try {
      m = require(name);
    } catch {}
    if (m) {
      for (const k of ["Session", "open"]) lock(m, k, name + " " + k);
    }
  }
  // WebAssembly compiles bytes in memory into code (code generation from
  // strings does not cover it): refused, by every way to a module or instance.
  const WA = globalThis.WebAssembly;
  if (WA) {
    for (const k of ["Module", "Instance", "compile", "instantiate", "compileStreaming", "instantiateStreaming"]) lock(WA, k, "WebAssembly." + k);
  }
  Module.syncBuiltinESMExports();
  // Programs. The run's own code starts none (Enclawed read it as code that
  // starts none); the toolchain may (npm runs a script's line with sh, which
  // runs contained like the rest), and node's own internals may start node
  // itself under this guard (the test runner runs each test file in a child).
  // Whatever path returns child_process (require, import, getBuiltinModule,
  // Module._load), it is the one module object stubbed here.
  let siteFile = null;
  {
    const h = {};
    const prev = E.prepareStackTrace;
    E.prepareStackTrace = (_e, cs) => cs;
    capture(h);
    // The stack is formatted when first read: read it while ours is in place.
    const st = h.stack;
    E.prepareStackTrace = prev;
    const site = st && st[0];
    siteFile = site ? Object.getPrototypeOf(site).getFileName : null;
  }
  const callerFile = () => {
    if (typeof siteFile !== "function") return undefined;
    const holder = {};
    const prev = E.prepareStackTrace;
    let frames = null;
    try {
      E.prepareStackTrace = (_e, cs) => cs;
      capture(holder, callerFile);
      frames = holder.stack;
    } catch {
      return undefined;
    } finally {
      try {
        E.prepareStackTrace = prev;
      } catch {}
    }
    if (!apply(isArray, Array, [frames])) return undefined;
    for (let i = 0; i < frames.length; i++) {
      const n = apply(siteFile, frames[i], []);
      if (typeof n !== "string" || n === "" || n === GUARD || apply(strStarts, n, ["node:"])) continue;
      if (!starts(n, "file:")) return n;
      try {
        return pathOf(n);
      } catch {
        return undefined;
      }
    }
    return null; // node's own internals only
  };
  const refuseStart = (what) => {
    throw new CodeNotRead(what, "a contained run's own code starts no program");
  };
  // Everything a start is decided on is first copied, once, into plain
  // primitives (no getter, toString or proxy of the run can answer the check one
  // way and the start another): data properties only, strings only.
  // Own data properties only: an assignment could reach a setter a prototype holds.
  const put = (o, k, v) => {
    apply(defineProp, Object, [o, k, { value: v, writable: true, enumerable: true, configurable: true }]);
  };
  const dataOf = (o, k) => {
    const d = apply(gopd, Object, [o, k]);
    if (d === undefined) return undefined;
    if (!("value" in d) || "get" in d || "set" in d) refuseStart("a start whose options are computed");
    return d.value;
  };
  const prim = (v) => {
    const t = typeof v;
    if (t === "string") return v;
    if (t === "number" || t === "boolean" || t === "bigint") return "" + v;
    refuseStart("a start with an argument that is not a string");
  };
  const strings = (arr) => {
    if (arr === undefined || arr === null) return [];
    if (!apply(isArray, Array, [arr])) refuseStart("a start whose arguments are not a list");
    const n = dataOf(arr, "length");
    const out = [];
    for (let i = 0; i < n; i++) put(out, "" + i, prim(dataOf(arr, "" + i)));
    return out;
  };
  const record = (o) => {
    const out = apply(createObj, Object, [null]);
    if (o === undefined || o === null) return out;
    if (typeof o !== "object") refuseStart("a start whose options are not an object");
    const keys = apply(ownKeys, Reflect, [o]);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (typeof k !== "string") continue;
      put(out, k, dataOf(o, k));
    }
    return out;
  };
  const envRecord = (e) => {
    const r = record(e);
    const out = apply(createObj, Object, [null]);
    const keys = apply(ownKeys, Reflect, [r]);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (r[k] !== undefined) put(out, k, prim(r[k]));
    }
    return out;
  };
  // node itself, started by node's own internals only (the test runner's
  // children): an allowlist of the options node's own test runner passes on
  // (getRunArgs: the parent's filtered execArgv, --test-force-exit,
  // --test-name-pattern/--test-skip-pattern, --test-only), then one file
  // Enclawed read; what follows the file is that program's own argv. It always
  // gets this guard's own NODE_OPTIONS.
  const NODE_OPTS = "--require=" + GUARD + " --disallow-code-generation-from-strings";
  const CHILD_FLAGS = ["--test", "--test-only", "--test-force-exit", "--no-warnings", "--enable-source-maps", "--trace-warnings", "--disallow-code-generation-from-strings"];
  const CHILD_VALUED = ["--test-name-pattern", "--test-skip-pattern", "--test-concurrency", "--test-timeout", "--test-isolation", "--test-reporter", "--test-reporter-destination"];
  // Workers: on a file Enclawed read (a path or a file: URL, read here once),
  // under this guard. Never code from a string, never node options of their
  // own, and a worker's own environment gets this guard's NODE_OPTIONS.
  const wt = require("node:worker_threads");
  const Worker = wt.Worker;
  const SHARE_ENV = wt.SHARE_ENV;
  class GuardedWorker extends Worker {
    constructor(file, options) {
      const refuse = (why) => {
        throw new CodeNotRead("a worker", why);
      };
      const href = typeof file === "string" ? file : file !== null && typeof file === "object" ? file.href : undefined;
      if (typeof href !== "string" || (typeof file !== "string" && !starts(href, "file:"))) refuse("its code is not a file Enclawed read");
      const real = realOf(starts(href, "file:") ? pathOf(href) : href);
      pinned(real);
      const o = record(options);
      if (o.eval) refuse("code built at run time is not run");
      if (o.execArgv !== undefined) refuse("a worker takes no node options of its own");
      if (o.env !== undefined && o.env !== SHARE_ENV) {
        const env = envRecord(o.env);
        put(env, "NODE_OPTIONS", NODE_OPTS);
        put(o, "env", env);
      }
      super(real, o);
    }
  }
  try {
    defineProp(wt, "Worker", { value: GuardedWorker, writable: false, configurable: false });
  } catch {}
  if (wt.Worker !== GuardedWorker) fail("worker_threads Worker could not be guarded; nothing was run");
  // node:sqlite loads native extensions: no database allows them and no way to
  // load one is left (taken now, its experimental warning held for the run).
  let sqlite = null;
  {
    const warn = process.emitWarning;
    process.emitWarning = () => {};
    try {
      sqlite = require("node:sqlite");
    } catch {}
    process.emitWarning = warn;
  }
  if (sqlite && typeof sqlite.DatabaseSync === "function") {
    const Db = sqlite.DatabaseSync;
    const construct = Reflect.construct;
    const DatabaseSync = function DatabaseSync(location, options) {
      if (new.target === undefined) throw new CodeNotRead("node:sqlite DatabaseSync", "it is a constructor");
      const o = record(options);
      if (o.allowExtension) throw new CodeNotRead("a sqlite extension", "a contained run loads no native extension");
      return apply(construct, Reflect, [Db, options === undefined ? [location] : [location, o], new.target]);
    };
    DatabaseSync.prototype = Db.prototype;
    lock(Db.prototype, "loadExtension", "node:sqlite loadExtension");
    lock(Db.prototype, "enableLoadExtension", "node:sqlite enableLoadExtension");
    try {
      defineProp(Db.prototype, "constructor", { value: DatabaseSync, writable: false, configurable: false });
      defineProp(sqlite, "DatabaseSync", { value: DatabaseSync, writable: false, configurable: false });
    } catch {}
    if (sqlite.DatabaseSync !== DatabaseSync || Db.prototype.constructor !== DatabaseSync) fail("node:sqlite could not be guarded; nothing was run");
  }
  Module.syncBuiltinESMExports();
  const nodeChildOk = (file, args, cwd) => {
    if (file !== execPath) return false;
    for (let i = 0; i < args.length; i++) {
      const x = args[i];
      if (x === "--require=" + GUARD) continue;
      if ((x === "--require" || x === "-r") && args[i + 1] === GUARD) {
        i++;
        continue;
      }
      if (apply(arrIncludes, CHILD_FLAGS, [x])) continue;
      const base = typeof cwd === "string" && cwd !== "" ? cwd : apply(cwd0, process, []);
      const eq = apply(strIndexOf, x, ["="]);
      if (eq > 0 && apply(arrIncludes, CHILD_VALUED, [apply(strSlice, x, [0, eq])])) {
        if (!valueOk(apply(strSlice, x, [0, eq]), apply(strSlice, x, [eq + 1]), base)) return false;
        continue;
      }
      if (apply(strStarts, x, ["-"])) return false;
      // The program: a file Enclawed read; what follows is its own argv.
      const real = realOf(apply(pathResolve, null, [base, x]));
      return apply(mapHas, PINS, [real]) && !trusted(real);
    }
    return false;
  };
  // Toolchain code starts programs only in a process whose own program is the
  // toolchain's (npm running a script's line). In a process started on code of
  // the run (its script, its tests), toolchain code it loads (a reporter, a
  // module by path) starts nothing: which toolchain code runs there, and with
  // what, is the run's choice.
  const mainToolchain = (() => {
    const m = process.argv[1];
    if (typeof m !== "string" || m === "") return false;
    return trusted(realOf(apply(pathResolve, null, [apply(cwd0, process, []), m])));
  })();
  const startKind = (file, args, cwd) => {
    const who = callerFile();
    if (who === undefined) return null;
    if (who === null) return nodeChildOk(file, args, cwd) ? "node-child" : null;
    return mainToolchain && trusted(realOf(who)) ? "toolchain" : null;
  };
  const cp = require("node:child_process");
  const proto = cp.ChildProcess && cp.ChildProcess.prototype;
  if (proto && typeof proto.spawn === "function") {
    const spawn0 = proto.spawn;
    const guardedSpawn = function (options) {
      const o = record(options);
      const file = prim(o.file);
      const argv = strings(o.args);
      let pairs = strings(o.envPairs);
      const kind = startKind(file, apply(slice, argv, [1]), o.cwd);
      if (kind === null) refuseStart("starting " + file);
      if (kind === "node-child") {
        const kept = [];
        for (let i = 0; i < pairs.length; i++) {
          if (!apply(strStarts, pairs[i], ["NODE_OPTIONS="])) put(kept, "" + kept.length, pairs[i]);
        }
        put(kept, "" + kept.length, "NODE_OPTIONS=" + NODE_OPTS);
        pairs = kept;
      }
      put(o, "file", file);
      put(o, "args", argv);
      put(o, "envPairs", pairs);
      return apply(spawn0, this, [o]);
    };
    try {
      Object.defineProperty(proto, "spawn", { value: guardedSpawn, writable: false, configurable: false });
    } catch {}
  }
  for (const k of ["spawnSync", "execSync", "execFileSync"]) {
    const f0 = cp[k];
    if (typeof f0 !== "function") continue;
    const g = function (a0, a1, a2) {
      let file;
      let args;
      let opts;
      if (k === "execSync") {
        file = "/bin/sh";
        args = [];
        put(args, "0", "-c");
        put(args, "1", prim(a0));
        opts = record(a1);
      } else {
        file = prim(a0);
        if (apply(isArray, Array, [a1])) {
          args = strings(a1);
          opts = record(a2);
        } else {
          args = [];
          opts = record(a1);
        }
      }
      const env = opts.env === undefined ? envRecord(process.env) : envRecord(opts.env);
      const kind = startKind(file, args, opts.cwd);
      if (kind === null) refuseStart("starting " + file);
      if (kind === "node-child") put(env, "NODE_OPTIONS", NODE_OPTS);
      put(opts, "env", env);
      return k === "execSync" ? apply(f0, this, [args[1], opts]) : apply(f0, this, [file, args, opts]);
    };
    try {
      Object.defineProperty(cp, k, { value: g, writable: false, configurable: false });
    } catch {}
  }
  // Native bindings (spawn_sync, process_wrap, ...) are not reached by name.
  for (const k of ["binding", "_linkedBinding"]) {
    try {
      Object.defineProperty(process, k, {
        value: () => refuseStart("process." + k),
        writable: false,
        configurable: false,
      });
    } catch {}
  }
  if (typeof process.execve === "function") {
    try {
      Object.defineProperty(process, "execve", { value: () => refuseStart("process.execve"), writable: false, configurable: false });
    } catch {}
  }
})();
`;
}

/** The python guard: the script the wrapper starts; it installs the audit hook, then runs the run's code. */
export function pythonGuardSource(
  pins: readonly CodePin[],
  toolchain: readonly string[],
  stdinPins: readonly string[] = [],
  venv: Readonly<{ site: string; systemSite: boolean }> | null = null,
): string {
  const pinDict = `{${pins.map((p) => `${json(p.path)}: ${json(p.sha256)}`).join(", ")}}`;
  const stdinSet = `frozenset([${stdinPins.map((h) => json(h)).join(", ")}])`;
  const venvTuple = venv ? `(${json(venv.site)}, ${venv.systemSite ? "True" : "False"})` : "None";
  return `# Enclawed code pins: python guard (generated). See the kit's
# containment/code-guard.ts.
import sys

# Programs this run may read from standard input (here-documents Enclawed read), by SHA-256.
_ENCLAWED_STDIN = ${stdinSet}

# The project virtual environment the run's Python runs as: (site-packages, include system site-packages).
_ENCLAWED_VENV = ${venvTuple}


def _enclawed_paths(toolchain):
    # Path primitives over the interpreter's own C functions, bound now (before
    # the run's code starts): the standard library's os.path is Python code whose
    # modules the run may change. Each call makes fresh closures, so what one
    # user of them holds (the archive hook below is reachable from sys.path_hooks)
    # is not what the audit hook holds.
    import posix

    lstat, readlink, getcwd = posix.lstat, posix.readlink, posix.getcwd
    str_, type_, OSError_, any_ = str, type, OSError, any
    TOOLCHAIN = tuple(toolchain)

    def realpath(p):
        # As os.path.realpath (not strict), for an exact str; None: a link loop.
        if not p.startswith("/"):
            p = getcwd() + "/" + p
        todo = p.split("/")
        todo.reverse()
        out = []
        hops = 0
        while todo:
            x = todo.pop()
            if x == "" or x == ".":
                continue
            if x == "..":
                if out:
                    out.pop()
                continue
            cand = "/" + "/".join(out + [x])
            try:
                st = lstat(cand)
            except OSError_:
                out.append(x)
                continue
            if st.st_mode & 0o170000 == 0o120000:
                hops += 1
                if hops > 64:
                    return None
                try:
                    t = readlink(cand)
                except OSError_:
                    out.append(x)
                    continue
                if type_(t) is not str_:
                    return None
                if t.startswith("/"):
                    out = []
                parts = t.split("/")
                parts.reverse()
                todo.extend(parts)
            else:
                out.append(x)
        return "/" + "/".join(out)

    def inside(d, p):
        return p == d or p.startswith(d.rstrip("/") + "/")

    def trusted(p):
        # A path of the toolchain (read-only, the interpreter's own files).
        if type_(p) is not str_ or not p.startswith("/"):
            return False
        r = realpath(p)
        return r is not None and any_(inside(d, r) for d in TOOLCHAIN)

    return realpath, trusted


def _enclawed_guard(run_code=None):
    # run_code: the -c or standard-input code this guard compiled (before the
    # hook was installed) from the text Enclawed read; the one code object the
    # guard itself starts.
    #
    # The hook runs no code of the run: everything it calls is bound here, before
    # the run's code starts (builtins, the interpreter's C functions, the
    # toolchain functions whose frames it recognizes, by identity), it reads no
    # attribute an object of the run defines, and it turns strings into exact
    # str first. Its state lives only in these closures: no frame of the guard
    # but _enclawed_main is handed to the run (frames of a closure write its
    # cells). The run's code never runs inside it: the collector runs only in a
    # thread of the guard's own (a finalizer would run in the frame it interrupts,
    # and the run cannot turn the collector back on), no signal handler is
    # installed, and an event raised inside the hook by anything but the guard
    # is refused.
    import _imp
    import _io
    import _signal
    import _thread
    import builtins
    import gc
    import hashlib
    import keyword
    import os
    import types

    B = builtins.__dict__
    type, len, any, all, bytes, str, int, tuple, list, frozenset, issubclass, OSError, PermissionError, ImportError, Exception = (
        B["type"], B["len"], B["any"], B["all"], B["bytes"], B["str"], B["int"], B["tuple"], B["list"], B["frozenset"], B["issubclass"], B["OSError"], B["PermissionError"], B["ImportError"], B["Exception"])
    getframe = sys._getframe
    add_hook = sys.addaudithook
    fopen = _io.open
    sha256 = hashlib.sha256
    get_ident = _thread.get_ident
    gc_isenabled, gc_disable, gc_collect = gc.isenabled, gc.disable, gc.collect
    is_frozen, get_frozen_object = _imp.is_frozen, _imp.get_frozen_object
    FSENC = sys.getfilesystemencoding()
    CodeType, FrameType, TracebackType, ModuleType = types.CodeType, types.FrameType, types.TracebackType, types.ModuleType
    MODULE_DICT = ModuleType.__dict__["__dict__"].__get__
    TYPE_DICT = type.__dict__["__dict__"].__get__
    MODULES = sys.modules
    import time as _time
    sleep = _time.sleep
    HARD_KEYWORDS = frozenset(keyword.kwlist)

    PINS = types.MappingProxyType(${pinDict})
    GUARD = ${json(PY_GUARD_PATH)}
    realpath, trusted = _enclawed_paths(${json(toolchain)})

    class CodeNotRead(PermissionError):
        pass

    def text(x):
        # x as an exact str (a subclass's own methods never run here), or None.
        t = type(x)
        if t is str:
            return x
        if t is bytes or issubclass(t, bytes):
            try:
                return bytes.decode(x, FSENC)
            except Exception:
                return None
        if issubclass(t, str):
            return "".join((x, ""))
        return None

    def refuse(what, why):
        w = text(what)
        raise CodeNotRead("Enclawed: %s was not loaded: %s (this contained run loads only the code Enclawed read)" % (w if w is not None else "code", why))

    # The guard's own frame lookups: sys._getframe raises an audit event, and the
    # hook hands no guard frame to anyone else.
    OWN = {}

    def own(fn, *a):
        # fn(*a) as the guard's own call: the events it raises are the guard's.
        tid = get_ident()
        OWN[tid] = OWN.get(tid, 0) + 1
        try:
            return fn(*a)
        finally:
            n = OWN[tid] - 1
            if n:
                OWN[tid] = n
            else:
                del OWN[tid]

    def own_frame(depth):
        return own(getframe, depth + 2)

    def raiser():
        # The frame that raised the event: the first one that is not the guard's.
        f = own_frame(1)
        while f is not None and f.f_code.co_filename == GUARD:
            f = f.f_back
        return f

    def is_guard_frame(f):
        return type(f) is FrameType and f.f_code.co_filename == GUARD and f.f_code.co_name not in ("_enclawed_main", "<module>")

    def genuine(f, fn):
        # f runs the toolchain function fn itself: its own code, its own module's globals.
        return f is not None and f.f_code is fn[0] and f.f_globals is fn[1]

    def ident(fn):
        return (fn.__code__, fn.__globals__)

    # Code objects of the toolchain, by identity: those of its modules loaded
    # before the run (below) and those the guard checked against the toolchain's
    # own bytes when they ran (exec). A frame running one is the toolchain's code.
    REG = {}

    def record(code):
        todo = [code]
        while todo:
            c = todo.pop()
            if REG.get(id(c)) is c:
                continue
            REG[id(c)] = c
            for k in c.co_consts:
                if type(k) is CodeType:
                    todo.append(k)

    def toolchain_code(f):
        c = f.f_code
        return REG.get(id(c)) is c

    def plain_names(names):
        # Exact str (a subclass may answer isidentifier as it likes), ASCII identifiers.
        return all(type(n) is str and n.isascii() and n.isidentifier() for n in names)

    def namedtuple_template_ok(src):
        # collections.namedtuple compiles exactly
        #   lambda _cls, NAMES: _tuple_new(_cls, (NAMES))
        # with NAMES its field names joined by ", " (one name: a trailing ",").
        if type(src) is bytes:
            src = src.decode("ascii", "strict") if src.isascii() else None
        if type(src) is not str:
            return False
        head, tail = "lambda _cls, ", "))"
        if not src.startswith(head) or not src.endswith(tail):
            return False
        body = src[len(head):-len(tail)]
        mid = ": _tuple_new(_cls, ("
        if body.count(mid) != 1:
            return False
        first, second = body.split(mid)
        if first != second:
            return False
        names = first[:-1].split(", ") if first.endswith(",") and ", " not in first else first.split(", ")
        return len(names) > 0 and plain_names(names) and not any(n in HARD_KEYWORDS for n in names)

    # The toolchain functions whose run-time code the guard admits, as they are now.
    import ast as _ast_mod
    import collections as _coll

    AST_PARSE = ident(_ast_mod.parse)
    ONLY_AST = _ast_mod.PyCF_ONLY_AST
    NAMEDTUPLE = ident(_coll.namedtuple)
    # (Python 3.14: the guard runs on no older interpreter, see _enclawed_main.)
    import annotationlib as _al
    import dataclasses as _dc

    DC_SNAPSHOT = types.MappingProxyType({k: v for k, v in _dc.__dict__.items() if not k.startswith("__")})
    DC_ADD = ident(_dc._FuncBuilder.add_fns_to_class)
    DC_PROCESS = ident(_dc._process_class)
    DC_GLOBALS = _dc.__dict__
    _dcc = _dc.dataclass.__code__
    DC_CHAIN = frozenset([_dcc, _dc.make_dataclass.__code__] + [c for c in _dcc.co_consts if type(c) is CodeType and c.co_name == "wrap"])
    ANNOTATE = frozenset(v.__code__ for v in _al.__dict__.values() if type(v) is types.FunctionType and v.__globals__ is _al.__dict__)
    ANNOTATE_GLOBALS = _al.__dict__
    FORWARD_CODE = ident(_al.ForwardRef.__forward_code__.fget)
    FORWARD_EVALUATE = ident(_al.ForwardRef.evaluate)
    GET_ANNOTATIONS = ident(_al.get_annotations)
    CORO = ident(types.coroutine)
    import _frozen_importlib as _fi
    import _frozen_importlib_external as _fie
    CALL_REMOVED = ident(_fi._call_with_frames_removed)
    FROZEN_GET_CODE = ident(_fi.FrozenImporter.get_code)
    COMPILE_BYTECODE = ident(_fie._compile_bytecode)
    SOURCE_GET_CODE = ident(_fie.SourceLoader.get_code)
    IMP_DICT = _imp.__dict__

    def dc_unchanged():
        now = _dc.__dict__
        if len(now) - sum(1 for k in now if k.startswith("__")) != len(DC_SNAPSHOT):
            return False
        return all(now.get(k) is v for k, v in DC_SNAPSHOT.items())

    # dataclasses builds the methods of a class from text: the text is read here
    # with the words dataclasses writes (any other word, call or attribute: refused).
    DC_NAMES = frozenset(("self", "other", "name", "value", "cls", "super", "type", "hash", "NotImplemented", "FrozenInstanceError", "__dataclass_builtins_object__", "__dataclass_self__", "__dataclass_HAS_DEFAULT_FACTORY__", "__dataclasses_recursive_repr", "BUILTINS", "MISSING", "object"))
    DC_CALLABLE = frozenset(("super", "type", "hash", "FrozenInstanceError", "__dataclass_builtins_object__", "__dataclass_self__", "self", "other", "__dataclasses_recursive_repr", "BUILTINS", "object"))
    DC_ATTRS = frozenset(("__class__", "__qualname__", "__setattr__", "__delattr__", "__post_init__"))
    DC_KEYWORDS = frozenset(("def", "return", "if", "else", "is", "in", "or", "and", "not", "raise", "pass", "True", "False", "None"))
    IDENT_CHARS = frozenset("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_")
    OPS = ("->", "==", "!=", "<=", ">=", "(", ")", ",", ":", "=", "<", ">", ".", "*", "{", "}", "@", "[", "]")

    def dc_word(w):
        # The names dataclasses gives its locals: __dataclass_<what>__.
        return w.startswith("__dataclass_") and w.endswith("__") and len(w) > 14

    def dc_fstring(body, F):
        # {self.a.b}, {self.x!r}, {name!r}: dotted attributes the rules allow.
        out = []
        i = 0
        while i < len(body):
            c = body[i]
            if c == "}":
                return None
            if c != "{":
                i += 1
                continue
            j = body.find("}", i)
            if j < 0:
                return None
            expr = body[i + 1:j]
            if expr.endswith("!r"):
                expr = expr[:-2]
            parts = expr.split(".")
            if not parts or parts[0] not in ("self", "name", "other") or not plain_names(parts):
                return None
            if any(p not in DC_ATTRS and p not in F for p in parts[1:]):
                return None
            i = j + 1
        return True

    def dc_tokens(src, F):
        toks = []
        i, n = 0, len(src)
        while i < n:
            c = src[i]
            if c == " " or c == chr(10):
                if c == chr(10):
                    toks.append(("nl", c))
                i += 1
                continue
            if c in IDENT_CHARS:
                j = i
                while j < n and src[j] in IDENT_CHARS:
                    j += 1
                w = src[i:j]
                if w[0] in "0123456789":
                    return None
                if j < n and src[j] in ("'", '"'):
                    if w != "f":
                        return None
                    q = src[j]
                    k = src.find(q, j + 1)
                    if k < 0 or dc_fstring(src[j + 1:k], F) is None:
                        return None
                    body = src[j + 1:k]
                    if chr(10) in body or chr(92) in body:
                        return None
                    toks.append(("str", None))
                    i = k + 1
                    continue
                toks.append(("id", w))
                i = j
                continue
            if c in ("'", '"'):
                k = src.find(c, i + 1)
                if k < 0:
                    return None
                body = src[i + 1:k]
                if chr(10) in body or chr(92) in body:
                    return None
                toks.append(("str", None))
                i = k + 1
                continue
            for op in OPS:
                if src.startswith(op, i):
                    toks.append(("op", op))
                    i += len(op)
                    break
            else:
                return None
        return toks

    def dc_text_ok(src, fields):
        if type(src) is bytes:
            if not src.isascii():
                return False
            src = src.decode("ascii", "strict")
        if type(src) is not str or not src.isascii() or not src.startswith("def __create_fn__("):
            return False
        F = frozenset(fields)
        if not plain_names(F) or any(f in HARD_KEYWORDS for f in F):
            return False
        toks = dc_tokens(src, F)
        if toks is None:
            return False
        defined = frozenset(toks[k + 1][1] for k in range(len(toks) - 1) if toks[k] == ("id", "def") and toks[k + 1][0] == "id")
        if any(not (d.startswith("__") and d.endswith("__") and plain_names([d])) for d in defined):
            return False
        for k, (kind, v) in enumerate(toks):
            prev = toks[k - 1] if k else ("nl", "")
            nxt = toks[k + 1] if k + 1 < len(toks) else ("nl", "")
            if kind == "op":
                if v in ("[", "]"):
                    return False
                if v == "." and nxt[0] != "id":
                    return False
                if v == "*" and nxt != ("op", ","):
                    return False
                if v == "@" and nxt != ("id", "__dataclasses_recursive_repr"):
                    return False
                continue
            if kind != "id":
                continue
            calls = nxt in (("op", "("), ("op", "."))
            if prev == ("op", "."):
                before = toks[k - 2] if k >= 2 else ("nl", "")
                if before == ("op", ")") and v not in ("__setattr__", "__delattr__"):
                    return False
                if v in DC_ATTRS:
                    continue
                if v not in F or calls:
                    return False
                continue
            if prev == ("id", "def"):
                continue
            if v in DC_KEYWORDS:
                continue
            if v in HARD_KEYWORDS:
                return False
            if v in DC_CALLABLE or dc_word(v):
                continue
            if calls:
                return False
            if v not in DC_NAMES and v not in F and v not in defined:
                return False
        return True

    DC_PASSED = {}

    # A string annotation (typing's forward references, from __future__ import
    # annotations) is compiled as an expression: only names, attributes,
    # subscripts, |, constants and nested strings, never a call or anything
    # that defines or binds (no parentheses, colons, =, keywords but None/True/False).
    ANN_CHARS = frozenset("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.[],| -")

    def ann_text_ok(src):
        if type(src) is bytes:
            if not src.isascii():
                return False
            src = src.decode("ascii", "strict")
        if type(src) is not str or not src.isascii() or len(src) > 4096:
            return False
        if src.startswith("(*") and src.endswith(",)[0]"):
            src = src[2:-5]  # annotationlib's rewriting of a star unpack ('*Ts')
        i, n = 0, len(src)
        while i < n:
            c = src[i]
            if c in ("'", '"'):
                k = src.find(c, i + 1)
                if k < 0 or chr(10) in src[i + 1:k] or chr(92) in src[i + 1:k]:
                    return False
                i = k + 1
                continue
            if c not in ANN_CHARS:
                return False
            if c in IDENT_CHARS:
                j = i
                while j < n and src[j] in IDENT_CHARS:
                    j += 1
                w = src[i:j]
                if w in HARD_KEYWORDS and w not in ("None", "True", "False"):
                    return False
                if j < n and src[j] in ("'", '"'):
                    return False  # a string prefix (f, b, r, ...)
                i = j
                continue
            i += 1
        return True

    def dataclass_ok(f, src, compiling):
        # The text that dataclasses' own _FuncBuilder.add_fns_to_class runs, called by
        # dataclasses' own _process_class with the builder it made, for a class whose
        # fields are plain identifiers, dataclasses' names unchanged, decorated from
        # toolchain code or a file Enclawed read; and the text itself has only what
        # dataclasses writes.
        if _dc is None or not genuine(f, DC_ADD) or not dc_unchanged():
            return False
        p = f.f_back
        if not genuine(p, DC_PROCESS):
            return False
        loc, ploc = f.f_locals, p.f_locals
        cls = ploc.get("cls")
        if loc.get("self") is not ploc.get("func_builder") or loc.get("cls") is not cls or not issubclass(type(cls), type):
            return False
        flds = TYPE_DICT(cls).get("__dataclass_fields__")
        if type(flds) is not dict or not plain_names(list(flds.keys())):
            return False
        h = p.f_back
        while h is not None and h.f_globals is DC_GLOBALS and h.f_code in DC_CHAIN:
            h = h.f_back
        if h is None:
            return False
        c = h.f_code.co_filename
        r = realpath(absolute(c)) if type(c) is str and c and not c.startswith("<") else None
        if r is None or not (toolchain_code(h) or PINS.get(r) is not None):
            return False
        tid = get_ident()
        if compiling:
            if not dc_text_ok(src, list(flds.keys())):
                return False
            DC_PASSED[tid] = f
            return True
        # The run of the text just read, in the same frame.
        if DC_PASSED.get(tid) is f:
            del DC_PASSED[tid]
            return True
        return False

    NT_PASSED = {}

    def built_at_run_time(what, compiling=False, src=None):
        # Code built from a string runs only when the toolchain builds it from
        # text whose shape the guard checks here: collections.namedtuple (its exact
        # template over plain identifiers), ast.parse (a syntax tree, never code:
        # its flags ask for one), dataclasses (the text dataclasses writes) and
        # annotationlib's string annotations (names, attributes, subscripts only).
        # Each is recognized by its own code object and its own module's globals,
        # never by a file or function name; any other caller, the guard's own code
        # included (it compiled the run's code before this hook was installed):
        # refused.
        f = raiser()
        if f is not None:
            tid = get_ident()
            if genuine(f, NAMEDTUPLE):
                if compiling and namedtuple_template_ok(src):
                    NT_PASSED[tid] = f
                    return
                if not compiling and NT_PASSED.get(tid) is f:
                    del NT_PASSED[tid]
                    return
            elif genuine(f, AST_PARSE):
                fl = f.f_locals.get("flags")
                if compiling and type(fl) is int and fl & ONLY_AST:
                    return
            elif genuine(f, FORWARD_CODE):
                if compiling and ann_text_ok(src):
                    return
            elif genuine(f, GET_ANNOTATIONS):
                if compiling and ann_text_ok(src):
                    NT_PASSED[tid] = f
                    return
                if not compiling and NT_PASSED.get(tid) is f:
                    del NT_PASSED[tid]
                    return
            elif genuine(f, FORWARD_EVALUATE):
                # The code of a forward reference: every code object made from a
                # string is one of the texts admitted here.
                if not compiling:
                    return
            elif compiling or what == "code built at run time":
                if dataclass_ok(f, src, compiling):
                    return
        refuse(what, "code built at run time is not run")

    # Bytecode is read only from a toolchain .pyc the import system just opened,
    # with the bytes that file holds.
    pyc_opened = [None]

    def check_file(fn, data):
        r = realpath(fn)
        if r is None:
            refuse(fn, "it is not one of the files Enclawed read")
        if trusted(r):
            # Source compiled under a toolchain name must be that file's own bytes.
            if data is not None:
                try:
                    same = own(read_file, r) == data
                except OSError:
                    same = False
                if not same:
                    refuse(fn, "its content is not the toolchain file of that name")
            return
        want = PINS.get(r)
        if want is None:
            refuse(fn, "it is not one of the files Enclawed read")
        if data is not None and sha256(data).hexdigest() != want:
            refuse(fn, "its content is not what Enclawed read")
        if data is not None and not source_encoding_ok(data):
            refuse(fn, "its coding line names a codec other than utf-8, ascii or latin-1")

    SPACE = bytes((32, 9, 12))
    NAME_OK = frozenset(b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.")
    ENCODINGS_OK = ("utf-8", "utf8", "utf_8", "utf-8-sig", "utf_8_sig", "ascii", "us-ascii", "latin-1", "latin1", "latin_1", "iso-8859-1", "iso8859-1", "iso_8859_1", "l1")

    def source_encoding_ok(data):
        # A coding line (PEP 263, the first two lines) may name only the
        # interpreter's own source encodings: any other name goes through the
        # codec registry, where the run may have registered its own decoder.
        for line in data.split(bytes((10,)))[:2]:
            s = line.lstrip(SPACE)
            if not s.startswith(b"#"):
                continue
            i = s.find(b"coding")
            while i >= 0:
                if s[i + 6:i + 7] in (b":", b"="):
                    rest = s[i + 7:].lstrip(SPACE)
                    n = 0
                    while n < len(rest) and rest[n] in NAME_OK:
                        n += 1
                    if rest[:n].decode("ascii").lower() not in ENCODINGS_OK:
                        return False
                i = s.find(b"coding", i + 1)
        return True

    def frozen_code_ok(code):
        # A code object named as a frozen module is that frozen module's own code.
        fn = code.co_filename
        name = fn[len("<frozen "):-1] if fn.startswith("<frozen ") and fn.endswith(">") else None
        if name is None or not plain_names(name.split(".")):
            return False
        try:
            return bool(is_frozen(name)) and own(get_frozen_object, name) == code
        except Exception:
            return False

    def read_file(p):
        try:
            with fopen(p, "rb") as fh:
                return fh.read()
        except OSError:
            return None

    def absolute(p):
        return p if p.startswith("/") else os_getcwd() + "/" + p

    import posix
    os_getcwd = posix.getcwd

    def memory_name(rp):
        return rp is not None and rp.startswith("/proc/") and (rp.endswith(("/mem", "/pagemap")) or "/map_files" in rp)

    def check(event, args):
        if event == "compile":
            src, fn = args[0], text(args[1])
            # ast.parse itself (its flags ask for a syntax tree): no code, whatever
            # the text or the file name it is given.
            f = raiser()
            if f is not None and genuine(f, AST_PARSE):
                fl = f.f_locals.get("flags")
                if type(fl) is int and fl & ONLY_AST:
                    return
            # A file name given relative (runpy compiles a script by the path it was
            # given) is that file: checked like an absolute one. "<...>" names a string.
            if fn is not None and fn and not fn.startswith("<"):
                fn = absolute(fn)
            if fn is not None and fn.startswith("/"):
                t = type(src)
                if t is bytes:
                    check_file(fn, src)
                elif t is bytearray or t is memoryview:
                    check_file(fn, bytes(src))
                elif t is str:
                    check_file(fn, src.encode("utf-8"))
                else:
                    # A syntax tree made into code is code nobody read as text (whoever
                    # built or changed the tree): refused. ast.parse of a tree gives a tree.
                    f = raiser()
                    if f is not None and genuine(f, AST_PARSE):
                        fl = f.f_locals.get("flags")
                        if type(fl) is int and fl & ONLY_AST:
                            return  # a tree in, a tree out
                    refuse(fn, "code compiled from a syntax tree is not run")
            else:
                built_at_run_time("code compiled from a string", True, src)
        elif event == "exec":
            code = args[0]
            if run_code is not None and code is run_code:
                return  # the run's own code (-c or standard input), as Enclawed read it
            if type(code) is not CodeType:
                refuse("code", "code built at run time is not run")
            fn = code.co_filename
            if fn and not fn.startswith("<"):
                fn = absolute(fn)
            if fn.startswith("/"):
                check_file(fn, None)
                if trusted(fn):
                    record(code)
            elif fn.startswith("<frozen "):
                if not frozen_code_ok(code):
                    refuse(fn, "it is not the interpreter's own frozen module of that name")
                record(code)
            else:
                built_at_run_time("code built at run time")
        elif event == "marshal.loads":
            ok = bool(OWN.get(get_ident()))  # the guard's own reading of a frozen module
            f = raiser()
            data = args[0] if args else None
            # The interpreter's frozen modules (FrozenImporter): its own data, read
            # by its own code, by a module name.
            if ok:
                pass
            elif f is not None and genuine(f, CALL_REMOVED) and f.f_locals.get("f") is get_frozen_object:
                ok = True
            elif f is not None and genuine(f, FROZEN_GET_CODE) and IMP_DICT.get("get_frozen_object") is get_frozen_object and f.f_globals.get("_imp") is _imp:
                ok = True
            elif f is not None and genuine(f, COMPILE_BYTECODE) and genuine(f.f_back, SOURCE_GET_CODE) and pyc_opened[0] is not None and type(data) in (bytes, bytearray, memoryview):
                # Cached bytecode: the bytes after the header of the toolchain's
                # own .pyc that was just opened, for a module whose source is
                # there (SourceLoader). A sourceless .pyc (SourcelessFileLoader):
                # never, wherever it lies (no toolchain ships one; a virtual
                # environment's would be bytecode nobody read as source).
                whole = own(read_file, pyc_opened[0])
                ok = whole is not None and whole[16:] == bytes(data)
            pyc_opened[0] = None
            if not ok:
                refuse("bytecode", "bytecode is read only from the toolchain's own cached files")
        elif event == "marshal.load":
            refuse("bytecode", "bytecode is read only from the toolchain's own cached files")
        elif event == "function.__new__":
            # A function made by hand from a code object (types.FunctionType): only
            # by annotationlib's own functions (annotations), of checked code.
            f = raiser()
            if f is None or not (ANNOTATE_GLOBALS is not None and f.f_globals is ANNOTATE_GLOBALS and f.f_code in ANNOTATE):
                refuse("a function made from a code object", "code built at run time is not run")
            code = args[0]
            fn = code.co_filename if type(code) is CodeType else None
            if fn is None:
                refuse("a function made from a code object", "code built at run time is not run")
            if fn and not fn.startswith("<"):
                check_file(absolute(fn), None)
            elif fn.startswith("<frozen "):
                pass  # code of a frozen module's function, made by the toolchain's own code
            else:
                built_at_run_time("a function made from a code object")
        elif event == "code.__new__":
            f = raiser()
            if f is None or not genuine(f, CORO):
                refuse("a code object", "code built at run time is not run")
        elif event == "open":
            p = args[0]
            if type(p) is int:
                rp = realpath("/proc/self/fd/%d" % p)
                if memory_name(rp):
                    refuse(rp, "a process's memory is not opened")
                pyc_opened[0] = None
                return
            p = text(p)
            if p is None:
                refuse("a file", "a file name Enclawed does not read")
            # A process's memory (/proc/<pid>/mem, task/*/mem, map_files, pagemap),
            # by its own name, an fd alias or a symbolic link to it: never opened
            # (/proc is also read-only, and the name guard opens no procfs file
            # for writing).
            rp = realpath(p)
            if memory_name(rp):
                refuse(p, "a process's memory is not opened")
            if p.endswith((".pyc", ".pyo")):
                if rp is None or not trusted(rp):
                    refuse(p, "cached bytecode is not read from a writable place")
                pyc_opened[0] = rp
            else:
                pyc_opened[0] = None
        elif event in ("subprocess.Popen", "_posixsubprocess.fork_exec", "os.system", "os.exec", "os.posix_spawn", "os.spawn", "os.fork", "os.forkpty", "pty.spawn", "os.startfile", "os.kill", "os.killpg"):
            # No program is started from a contained python run (what it runs was
            # read as code that starts none).
            refuse(event, "a contained python run starts no program")
        elif event in ("sys.settrace", "sys.setprofile", "sys.monitoring.register_callback", "sys.remote_exec", "cpython.remote_debugger_script"):
            # A tracer sees every frame (the guard's and the toolchain's) and may move
            # where one continues: no contained python run traces, profiles or monitors.
            refuse(event, "a contained python run traces no code")
        elif event in ("gc.get_objects", "gc.get_referrers", "gc.get_referents", "sys._current_frames", "sys._current_exceptions", "sys.addaudithook"):
            # The collector's object lists and other threads' frames reach the
            # guard's own state; a second audit hook would see what this one does.
            refuse(event, "a contained python run does not walk the interpreter's objects")
        elif event == "sys._getframe":
            if not OWN.get(get_ident()) and is_guard_frame(args[0]):
                refuse("a frame", "the guard's own frames are not handed out")
        elif event == "object.__getattr__":
            if len(args) == 2 and type(args[1]) is str and args[1] == "f_code" and is_guard_frame(args[0]):
                refuse("a frame", "the guard's own frames are not handed out")
            if len(args) == 2 and type(args[1]) is str and args[1] in ("__code__", "__defaults__", "__kwdefaults__") and type(args[0]) is types.FunctionType and own(getattr_, args[0], "__code__").co_filename == GUARD:
                refuse("the guard", "the guard's own functions are not read")
            if len(args) == 2 and type(args[1]) is str and args[1] in ("tb_frame", "gi_frame", "cr_frame", "ag_frame") and not OWN.get(get_ident()):
                if is_guard_frame(own(getattr_, args[0], args[1])):
                    refuse("a frame", "the guard's own frames are not handed out")
        elif event in ("object.__setattr__", "object.__delattr__"):
            # The guard's own functions (the archive hook on sys.path_hooks) are not changed.
            o = args[0] if args else None
            if type(o) is types.FunctionType and own(getattr_, o, "__code__").co_filename == GUARD:
                refuse("the guard", "the guard's own functions are not changed")
        elif event.startswith("ctypes."):
            # ctypes reaches memory and native code (CDLL(None) is the interpreter
            # itself): no contained python run uses it.
            refuse(event, "a contained python run loads no native code by ctypes")
        elif event == "import":
            name = text(args[0])
            if name is None or name.split(".")[0] in NATIVE_MODULES:
                refuse(name, "a contained python run loads no module that reaches memory")
            # An extension module (the event _imp.create_dynamic raises with the
            # file it loads): only one of the toolchain's own files, never one of
            # the project, a writable place or a file the run wrote.
            fl = args[1] if len(args) > 1 else None
            if fl is not None:
                fl = text(fl)
                if fl is None or not trusted(absolute(fl)):
                    refuse(fl, "native code from a file other than the toolchain's is not loaded")
        elif event == "sqlite3.enable_load_extension":
            # sqlite loads native code by a file name (load_extension, in Python or in SQL).
            on = args[1] if len(args) > 1 else True
            if not (type(on) in (bool, int) and not on):
                refuse(event, "a contained python run loads no native code into sqlite")
        elif event == "sqlite3.load_extension":
            refuse(event, "a contained python run loads no native code into sqlite")

    getattr_ = B["getattr"]

    IN_HOOK = {}

    def hook(event, args):
        tid = get_ident()
        depth = IN_HOOK.get(tid, 0)
        if depth and OWN.get(tid):
            return  # the guard's own call (a file it reads, a frame or frozen module it looks up)
        if depth:
            # An event raised inside the hook by anything but the guard's own calls
            # (the guard reads frames' f_code and takes id() of code objects): refused.
            if not (event == "builtins.id" or (event == "object.__getattr__" and len(args) == 2 and type(args[1]) is str and args[1] == "f_code")):
                refuse(event, "nothing runs inside the guard")
            return
        if gc_isenabled():
            gc_disable()
            refuse(event, "the collector runs only in the guard's own thread")
        IN_HOOK[tid] = depth + 1
        try:
            check(event, args)
        finally:
            if depth:
                IN_HOOK[tid] = depth
            else:
                del IN_HOOK[tid]

    # Modules that reach the interpreter's memory or native code by address.
    NATIVE_MODULES = frozenset(("_ctypes", "ctypes", "_ctypes_test", "_testcapi", "_testinternalcapi", "_testlimitedcapi", "_testbuffer", "_testmultiphase", "_testsinglephase", "_testimportmultiple", "_testclinic", "_testclinic_limited", "_xxtestfuzz", "_testexternalinspection", "_remote_debugging"))

    sys.dont_write_bytecode = True
    # Archives on sys.path (zipimport) load only from the toolchain: an archive the
    # run wrote or the project holds is not code Enclawed read. The hook is reachable
    # from sys.path_hooks: it holds its own path functions, not the audit hook's.
    import zipimport

    def archive_hook(realpath, trusted, zipimporter, type, str, bytes, ImportError, FSENC):
        def toolchain_archives_only(p):
            if type(p) is bytes:
                p = p.decode(FSENC)
            if type(p) is not str:
                raise ImportError("Enclawed: not an archive Enclawed read")
            q = realpath(p)
            if q is None or not trusted(q):
                raise ImportError("Enclawed: %s is not an archive Enclawed read" % q)
            return zipimporter(p)

        return toolchain_archives_only

    toolchain_archives_only = archive_hook(*_enclawed_paths(${json(toolchain)}), zipimport.zipimporter, type, str, bytes, ImportError, FSENC)
    sys.path_hooks[:] = [toolchain_archives_only if h is zipimport.zipimporter else h for h in sys.path_hooks]
    sys.path_importer_cache.clear()
    # No signal handler of the run: one would run inside the hook, with its frame.
    def no_handlers(*a):
        raise PermissionError("Enclawed: a contained python run installs no signal handler")

    _signal.signal = no_handlers

    # sys.settrace(None) and sys.setprofile(None) (doctest, pdb's cleanup) do
    # nothing: no tracer is ever set. Any other function is refused.
    def no_tracer(func):
        if func is not None:
            raise PermissionError("Enclawed: a contained python run traces no code")

    sys.settrace = no_tracer
    sys.setprofile = no_tracer
    if "signal" in MODULES:
        MODULES["signal"].signal = no_handlers

    # Every built-in module, loaded now: no module instance is made after the run
    # starts (a new instance of gc, _imp or _signal would hold the functions
    # replaced here).
    for n in sys.builtin_module_names:
        if n not in MODULES:
            try:
                __import__(n)
            except Exception:
                pass

    def no_new_builtin(*a, **k):
        raise ImportError("Enclawed: a contained python run makes no new built-in module")

    _imp.create_builtin = no_new_builtin

    # The collector runs only in a thread of the guard's own, never in the run's
    # frames or the hook's; the run cannot turn it back on.
    def no_enable():
        return None

    gc_disable()
    gc.enable = no_enable

    def collector():
        while True:
            sleep(1.0)
            gc_collect()

    _thread.start_new_thread(collector, ())

    # The toolchain's code objects of the modules loaded now.
    for m in tuple(MODULES.values()):
        if not issubclass(type(m), ModuleType):
            continue
        md = MODULE_DICT(m)
        fl = md.get("__file__")
        spec = md.get("__spec__")
        if not ((type(fl) is str and trusted(fl)) or getattr(spec, "origin", None) == "frozen"):
            continue
        for v in tuple(md.values()):
            if type(v) is types.FunctionType and v.__globals__ is md:
                record(v.__code__)
            elif issubclass(type(v), type) and getattr(v, "__module__", None) == md.get("__name__"):
                for x in tuple(TYPE_DICT(v).values()):
                    if type(x) in (staticmethod, classmethod):
                        x = x.__func__
                    if type(x) is property:
                        for y in (x.fget, x.fset, x.fdel):
                            if type(y) is types.FunctionType:
                                record(y.__code__)
                    elif type(x) is types.FunctionType:
                        record(x.__code__)
    add_hook(hook)


def pytest_args(name, rest):
    # pytest runs with its assertions plain and no cache plugin, whatever the line,
    # its settings or the environment say (these options come last and win):
    # assertion rewriting compiles syntax trees, code nobody read as text.
    if name not in ("pytest", "py.test", "pytest-3"):
        return rest
    if "--" in rest:
        sys.stderr.write("Enclawed: pytest with -- is not a form this contained run takes; nothing was run\\n")
        sys.exit(126)
    # The environment's plugins and options (PYTEST_PLUGINS, PYTEST_ADDOPTS): not
    # the line's, not read: dropped.
    import os

    os.environ.pop("PYTEST_PLUGINS", None)
    os.environ.pop("PYTEST_ADDOPTS", None)
    return rest + ["-p", "no:cacheprovider", "--assert=plain"]


# After the run's code returns, the guard only exits (raise SystemExit): its frame
# unwinds and no path leads back to reading its arguments; the interpreter's own
# shutdown (threads joined, atexit, flushed streams) follows as for any program.
def _enclawed_main():
    # Contained python runs need Python 3.14 or newer (what this guard was verified on).
    if sys.version_info < (3, 14):
        sys.stderr.write("Enclawed: contained Python needs Python 3.14 or newer; this is %d.%d; nothing was run\\n" % sys.version_info[:2])
        sys.exit(126)
    import os
    import runpy
    import types

    # The arguments as the run was started with them, copied once: nothing the
    # run does to sys.argv changes what this guard runs.
    args = tuple(sys.argv[1:])
    safe = bool(sys.flags.isolated or getattr(sys.flags, "safe_path", False))
    # The project virtual environment: its site-packages in place of the
    # system's (after them when it includes them), as its python has them.
    # Only the path: no .pth file of it is processed (that would run its lines).
    if _ENCLAWED_VENV is not None:
        venv_site, system_site = _ENCLAWED_VENV
        system = [p for p in sys.path if p.endswith(("/site-packages", "/dist-packages"))]
        sys.path[:] = [p for p in sys.path if p not in system] + [venv_site] + (system if system_site else [])
    # The guard's own directory is not where the run's modules are found.
    if sys.path and sys.path[0] == ${json(CODE_GUARD_DIR)}:
        del sys.path[0]
    if len(args) >= 2 and args[0] == "-c":
        code = compile(args[1], "<string>", "exec")
        sys.argv = ["-c"] + list(args[2:])
        if not safe:
            sys.path.insert(0, "")
        main = types.ModuleType("__main__")
        main.__builtins__ = __builtins__
        sys.modules["__main__"] = main
        _enclawed_guard(code)
        exec(code, main.__dict__)
        raise SystemExit(0)
    if not args or args[0] == "-":
        # The program on standard input: run only when it is one Enclawed read.
        import hashlib

        data = sys.stdin.buffer.read()
        if hashlib.sha256(data).hexdigest() not in _ENCLAWED_STDIN:
            sys.stderr.write("Enclawed: the program on standard input is not one Enclawed read; nothing was run\\n")
            sys.exit(126)
        code = compile(data, "<stdin>", "exec")
        sys.argv = (["-"] + list(args[1:])) if args else [""]
        if not safe:
            sys.path.insert(0, "")
        main = types.ModuleType("__main__")
        main.__builtins__ = __builtins__
        sys.modules["__main__"] = main
        _enclawed_guard(code)
        exec(code, main.__dict__)
        raise SystemExit(0)
    if len(args) >= 2 and args[0] == "-m":
        sys.argv = ["-m"] + pytest_args(args[1], list(args[2:]))
        if not safe:
            sys.path.insert(0, os.getcwd())
        _enclawed_guard()
        runpy._run_module_as_main(args[1], alter_argv=True)
        raise SystemExit(0)
    if len(args) >= 1 and not args[0].startswith("-"):
        script = args[0]
        sys.argv = [script] + pytest_args(os.path.basename(script), list(args[1:]))
        if not safe:
            sys.path.insert(0, os.path.dirname(os.path.abspath(script)))
        _enclawed_guard()
        runpy.run_path(script, run_name="__main__")
        raise SystemExit(0)
    sys.stderr.write("Enclawed: python %s is not a form this contained run takes (only a script, -m, or -c code Enclawed read); nothing was run\\n" % (args[0] if args else "with no script"))
    sys.exit(126)


_enclawed_main()
`;
}
