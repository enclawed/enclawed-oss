// Code pins (M1): a contained run that was offered containment because
// Enclawed read what it runs (../adapter/contained-exec.ts) loads and executes
// no other code from the project or a writable place. The containment
// enforces it, so the run does not depend on the reading being complete:
//
//   native code   every writable mount (the project, /tmp, the sandbox home,
//                 /dev/shm) is noexec and anonymous executable memory is
//                 refused (./seccomp.ts): no program, shared library or
//                 native addon from a writable place is executed or mapped.
//                 A file the line runs directly (by its shebang) is bound
//                 executable on its own.
//   node          the program the view shows as node is a wrapper that starts
//                 the real binary with the guard preloaded first
//                 (--require, before anything else of the run) and code
//                 generation from strings off. The guard's module hooks
//                 (module.registerHooks: require and import alike) load a
//                 file outside the toolchain only when it is one Enclawed
//                 read and its bytes hash to what was read; the bytes checked
//                 are the bytes compiled. data: URLs, vm, process.dlopen of a
//                 writable file, eval workers and node options that load other
//                 code first (a loader, a preload) are refused.
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

export type CodePin = Readonly<{ path: string; sha256: string; exec: boolean }>;

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

/** Hidden path of the real interpreter beside its wrapper (same directory: its own prefix logic holds). */
export function hiddenInterpreterPath(real: string): string {
  const slash = real.lastIndexOf("/");
  return `${real.slice(0, slash)}/.enclawed-${real.slice(slash + 1)}`;
}

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

/** The node wrapper: the real binary with the guard first, whatever the run passes. */
export function nodeWrapper(hidden: string): string {
  const opts = `--require=${NODE_GUARD_PATH} --disallow-code-generation-from-strings`;
  return [
    "#!/bin/sh",
    "# Enclawed code pins: node starts with the guard first (generated).",
    `NODE_OPTIONS='${opts}'`,
    "export NODE_OPTIONS",
    `exec ${hidden} ${opts} "$@"`,
    "",
  ].join("\n");
}

/** The python wrapper: the real interpreter on the guard, the run's own flags kept. */
export function pythonWrapper(hidden: string): string {
  return [
    "#!/bin/sh",
    "# Enclawed code pins: python starts on the guard (generated).",
    "unset PYTHONINSPECT PYTHONSTARTUP PYTHONPYCACHEPREFIX",
    "F=",
    "while [ $# -gt 0 ]; do",
    '  case "$1" in',
    '    -?*) case "${1#-}" in *[!IBEsuOqP]*) break ;; esac; F="$F $1"; shift ;;',
    "    *) break ;;",
    "  esac",
    "done",
    `exec ${hidden} -B -X pycache_prefix=${PY_CACHE_PREFIX} $F ${PY_GUARD_PATH} "$@"`,
    "",
  ].join("\n");
}

/** The node guard: preloaded first into every node process of the run. */
export function nodeGuardSource(pins: readonly CodePin[], toolchain: readonly string[]): string {
  return `// Enclawed code pins: node guard (generated). Loaded first; see the kit's
// containment/code-guard.ts.
"use strict";
(() => {
  const PINS = new Map(${json(pins.map((p) => [p.path, p.sha256]))});
  const TOOLCHAIN = ${json(toolchain)};
  const ARGS_OK = new Set(${json(NODE_ARGS_OK)});
  const GUARD = ${json(NODE_GUARD_PATH)};
  const fs = require("node:fs");
  const { createHash } = require("node:crypto");
  const { fileURLToPath } = require("node:url");
  const Module = require("node:module");
  const fail = (msg) => {
    try {
      fs.writeSync(2, "Enclawed: " + msg + "\\n");
    } catch {}
    process.exit(126);
  };
  if (typeof Module.registerHooks !== "function") {
    fail("this node has no module hooks, so the code it loads cannot be checked; nothing was run");
  }
  // Options that load other code before or around the guard are refused.
  for (const a of process.execArgv) {
    const name = a.split("=")[0];
    if (a === "--require=" + GUARD || a === GUARD) continue;
    if (!a.startsWith("-")) continue;
    if (!ARGS_OK.has(name)) {
      fail("node " + name + " is not an option this contained run takes (it may load code Enclawed did not read); nothing was run");
    }
  }
  const inside = (d, p) => p === d || p.startsWith(d.endsWith("/") ? d : d + "/");
  const trusted = (p) => TOOLCHAIN.some((d) => inside(d, p));
  const realOf = (p) => {
    try {
      return fs.realpathSync(p);
    } catch {
      return p;
    }
  };
  class CodeNotRead extends Error {
    constructor(what, why) {
      super("Enclawed: " + what + " was not loaded: " + why + " (this contained run loads only the code Enclawed read)");
      this.code = "ERR_ENCLAWED_CODE_NOT_READ";
    }
  }
  const sha = (b) => createHash("sha256").update(b).digest("hex");
  // The bytes of a file outside the toolchain, when they are what Enclawed read.
  const pinned = (p) => {
    const real = realOf(p);
    if (trusted(real)) return null;
    const want = PINS.get(real);
    if (!want) throw new CodeNotRead(p, "it is not one of the files Enclawed read");
    const buf = fs.readFileSync(real);
    if (sha(buf) !== want) throw new CodeNotRead(p, "its content is not what Enclawed read");
    return buf;
  };
  Module.registerHooks({
    load(url, context, nextLoad) {
      if (url.startsWith("data:")) {
        throw new CodeNotRead("a data: URL", "code built at run time is not loaded");
      }
      if (!url.startsWith("file:")) {
        return nextLoad(url, context);
      }
      const p = fileURLToPath(url);
      const buf = pinned(p);
      const r = nextLoad(url, context);
      if (buf === null) return r;
      if (r.format === "addon" || r.format === "wasm") {
        // Native or wasm code: only the bytes read (and a native addon cannot map from a noexec place).
        return { ...r, source: buf, shortCircuit: true };
      }
      return { format: r.format, source: buf, shortCircuit: true };
    },
  });
  // A module compiled by hand from a writable file is checked the same way.
  const compile = Module.prototype._compile;
  // node -e / -p compile their code (read by Enclawed) once, under this name.
  let evalSeen = false;
  Module.prototype._compile = function (content, filename, ...rest) {
    if (!evalSeen && typeof filename === "string" && /^\\[eval\\d*\\](?:-wrapper)?$/.test(filename)) {
      evalSeen = true;
      return compile.call(this, content, filename, ...rest);
    }
    if (typeof filename === "string" && filename.startsWith("/")) {
      const real = realOf(filename);
      if (!trusted(real)) {
        const want = PINS.get(real);
        const got = sha(Buffer.from(String(content), "utf8"));
        const gotBom = sha(Buffer.from("\\ufeff" + String(content), "utf8"));
        if (!want || (got !== want && gotBom !== want)) {
          throw new CodeNotRead(filename, want ? "its content is not what Enclawed read" : "it is not one of the files Enclawed read");
        }
      }
    } else if (typeof filename !== "string" || !filename.startsWith("/")) {
      throw new CodeNotRead("code built at run time", "it is not a file Enclawed read");
    }
    return compile.call(this, content, filename, ...rest);
  };
  const dlopen = process.dlopen;
  process.dlopen = function (module, filename, ...rest) {
    if (typeof filename !== "string" || !trusted(realOf(filename))) pinned(String(filename));
    return dlopen.call(this, module, filename, ...rest);
  };
  // vm compiles strings into code: refused here.
  const vm = require("node:vm");
  for (const k of ["Script", "compileFunction", "runInThisContext", "runInNewContext", "runInContext", "SourceTextModule", "SyntheticModule"]) {
    if (k in vm) {
      const refuse = function () {
        throw new CodeNotRead("vm." + k, "code built at run time is not run");
      };
      try {
        Object.defineProperty(vm, k, { value: refuse, writable: false, configurable: false });
      } catch {}
    }
  }
  const wt = require("node:worker_threads");
  const Worker = wt.Worker;
  class GuardedWorker extends Worker {
    constructor(file, options) {
      if (options && options.eval) throw new CodeNotRead("a worker from a string", "code built at run time is not run");
      if (typeof file === "string" && !file.startsWith("node:")) pinned(file.startsWith("file:") ? fileURLToPath(file) : file);
      super(file, options);
    }
  }
  try {
    Object.defineProperty(wt, "Worker", { value: GuardedWorker, writable: false, configurable: false });
  } catch {}
})();
`;
}

/** The python guard: the script the wrapper starts; it installs the audit hook, then runs the run's code. */
export function pythonGuardSource(pins: readonly CodePin[], toolchain: readonly string[]): string {
  const pinDict = `{${pins.map((p) => `${json(p.path)}: ${json(p.sha256)}`).join(", ")}}`;
  return `# Enclawed code pins: python guard (generated). See the kit's
# containment/code-guard.ts.
import sys


def _enclawed_guard():
    import hashlib
    import os

    PINS = ${pinDict}
    TOOLCHAIN = tuple(${json(toolchain)})
    GUARD = ${json(PY_GUARD_PATH)}
    # Toolchain modules that compile a caller's string: refused when a run's own code calls them.
    EVALUATORS = ("timeit.py", "doctest.py", "code.py", "codeop.py", "pdb.py", "bdb.py", "cProfile.py", "profile.py", "trace.py")

    def inside(d, p):
        return p == d or p.startswith(d.rstrip("/") + "/")

    def trusted(p):
        if p is None:
            return False
        if p.startswith("<frozen "):
            return True
        if not p.startswith("/"):
            return False
        r = os.path.realpath(p)
        return any(inside(d, r) for d in TOOLCHAIN)

    class CodeNotRead(PermissionError):
        pass

    def refuse(what, why):
        raise CodeNotRead("Enclawed: %s was not loaded: %s (this contained run loads only the code Enclawed read)" % (what, why))

    def caller(depth):
        f = sys._getframe(depth)
        while f is not None and f.f_code.co_filename == GUARD and f.f_code.co_name != "_enclawed_main":
            f = f.f_back
        return f

    def built_at_run_time(what):
        f = caller(2)
        c = f.f_code.co_filename if f is not None else None
        if not trusted(c):
            refuse(what, "code built at run time is not run")
        if os.path.basename(c) in EVALUATORS:
            g = f.f_back
            while g is not None and trusted(g.f_code.co_filename):
                g = g.f_back
            if g is not None:
                refuse(what, "code built at run time is not run")

    def check_file(fn, data):
        r = os.path.realpath(fn)
        if trusted(r):
            return
        want = PINS.get(r)
        if want is None:
            refuse(fn, "it is not one of the files Enclawed read")
        if data is not None and hashlib.sha256(data).hexdigest() != want:
            refuse(fn, "its content is not what Enclawed read")

    def hook(event, args):
        if event == "compile":
            src, fn = args[0], args[1]
            if isinstance(fn, bytes):
                fn = os.fsdecode(fn)
            if isinstance(fn, str) and fn.startswith("/"):
                if isinstance(src, (bytes, bytearray, memoryview)):
                    check_file(fn, bytes(src))
                elif isinstance(src, str):
                    check_file(fn, src.encode("utf-8"))
                else:
                    # A syntax tree (pytest's assertion rewriting of a test file it read): the file must be one Enclawed read.
                    check_file(fn, None)
            else:
                built_at_run_time("code compiled from a string")
        elif event == "exec":
            fn = getattr(args[0], "co_filename", None)
            if isinstance(fn, str) and fn.startswith("/"):
                check_file(fn, None)
            else:
                built_at_run_time("code built at run time")
        elif event in ("marshal.loads", "marshal.load", "code.__new__"):
            built_at_run_time("bytecode")
        elif event == "open":
            p, mode = args[0], args[1]
            if isinstance(p, bytes):
                p = os.fsdecode(p)
            if isinstance(p, str) and p.endswith((".pyc", ".pyo")) and not trusted(os.path.realpath(p)):
                refuse(p, "cached bytecode is not read from a writable place")
        elif event == "ctypes.dlopen":
            name = args[0]
            if isinstance(name, bytes):
                name = os.fsdecode(name)
            if isinstance(name, str) and "/" in name and not trusted(os.path.realpath(name)):
                refuse(name, "a shared library from a writable place is not loaded")

    sys.dont_write_bytecode = True
    sys.addaudithook(hook)


def _enclawed_main():
    import os
    import runpy
    import types

    args = sys.argv[1:]
    safe = bool(sys.flags.isolated or getattr(sys.flags, "safe_path", False))
    # The guard's own directory is not where the run's modules are found.
    if sys.path and sys.path[0] == ${json(CODE_GUARD_DIR)}:
        del sys.path[0]
    if len(args) >= 2 and args[0] == "-c":
        code = compile(args[1], "<string>", "exec")
        sys.argv = ["-c"] + args[2:]
        if not safe:
            sys.path.insert(0, "")
        main = types.ModuleType("__main__")
        main.__builtins__ = __builtins__
        sys.modules["__main__"] = main
        _enclawed_guard()
        exec(code, main.__dict__)
        return
    if len(args) >= 2 and args[0] == "-m":
        sys.argv = ["-m"] + args[2:]
        if not safe:
            sys.path.insert(0, os.getcwd())
        _enclawed_guard()
        runpy._run_module_as_main(args[1], alter_argv=True)
        return
    if len(args) >= 1 and not args[0].startswith("-"):
        script = args[0]
        sys.argv = args[:]
        if not safe:
            sys.path.insert(0, os.path.dirname(os.path.abspath(script)))
        _enclawed_guard()
        runpy.run_path(script, run_name="__main__")
        return
    sys.stderr.write("Enclawed: python %s is not a form this contained run takes (only a script, -m, or -c code Enclawed read); nothing was run\\n" % (args[0] if args else "with no script"))
    sys.exit(126)


_enclawed_main()
`;
}
