// enclawed adapter kit: the code a python command runs, and whether what it
// imports can only be the standard library.
//
// `python3 -I` (isolated) puts neither the current directory nor the
// script's directory nor PYTHONPATH on the module path and skips the user's
// site-packages. Without -I, three things could load other code than the
// standard library for an `import`: a module file or package in the first
// path entry (the script's directory, or the current directory for code
// given on standard input or with -c), a PYTHON* variable in the session's
// environment, and the user's site-packages (`usercustomize` and `.pth`
// files run at start). The run counts as standard-library-only when none of
// the three is possible: no module-like entry in that directory (a `.py`,
// `.pyc`, `.pyw`, `.so` or `.pyd` file, or a directory holding `__init__`)
// named as a standard-library module (the system python3's
// sys.stdlib_module_names, with sitecustomize and usercustomize) or as a
// module the code imports, the script itself excepted (every module-like
// entry when the list cannot be had), no PYTHON* variable in the known
// environment, and no `usercustomize` or `.pth` file in the user's
// site-packages. Anything that cannot be checked counts as possible.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { SimpleCommand } from "./shell-compound.js";

export type PythonRun = Readonly<{
  code: string;
  isolated: boolean;
  firstPath: string | null;
  script: string | null;
  /** sys.argv as the code sees it. */
  args: readonly string[];
}>;

const FLAGS = /^-[IEsSBuqOdv]+$/;

/**
 * The code a simple python command runs: `-c CODE`, a here-document on
 * standard input (`python3` or `python3 -` with no further argument), or a
 * script file. Null for anything else (another option, -m, arguments
 * after the code source that are not plain, a file too large).
 */
export function pythonRunOf(c: SimpleCommand): PythonRun | null {
  const argv = c.argv;
  if (!/^python3?(?:\.\d+)?$/.test(path.basename(argv[0] ?? ""))) {
    return null;
  }
  let i = 1;
  let isolated = false;
  while (i < argv.length && FLAGS.test(argv[i])) {
    isolated ||= argv[i].includes("I");
    i++;
  }
  const rest = argv.slice(i);
  if (rest[0] === "-c" && typeof rest[1] === "string") {
    return {
      code: rest[1],
      isolated,
      firstPath: c.cwd,
      script: null,
      args: ["-c", ...rest.slice(2)],
    };
  }
  if (rest.length === 0 && typeof c.stdin === "string") {
    return { code: c.stdin, isolated, firstPath: c.cwd, script: null, args: [""] };
  }
  if (rest[0] === "-" && typeof c.stdin === "string") {
    return { code: c.stdin, isolated, firstPath: c.cwd, script: null, args: rest };
  }
  if (rest.length >= 1 && rest[0].endsWith(".py") && !rest[0].startsWith("-") && c.stdin == null) {
    const file = path.resolve(c.cwd, rest[0]);
    try {
      const st = fs.statSync(file);
      if (!st.isFile() || st.size > 64 * 1024) {
        return null;
      }
      return {
        code: fs.readFileSync(file, "utf8"),
        isolated,
        firstPath: path.dirname(fs.realpathSync(file)),
        script: fs.realpathSync(file),
        args: rest,
      };
    } catch {
      return null;
    }
  }
  return null;
}

const MODULE_FILE = /\.(?:py|pyc|pyw|so|pyd)$/;

let stdlibNames: ReadonlySet<string> | null | undefined;
/**
 * The standard library's top-level module names, as the system python3
 * reports them (sys.stdlib_module_names, Python 3.10+), plus the start-up
 * hooks; null when they cannot be had (then every module-like entry counts).
 */
function stdlibModuleNames(): ReadonlySet<string> | null {
  if (stdlibNames === undefined) {
    const r = spawnSync(
      "python3",
      ["-I", "-S", "-c", "import sys;print('\\n'.join(sorted(sys.stdlib_module_names)))"],
      { encoding: "utf8", timeout: 5000, env: { PATH: "/usr/bin:/bin" } },
    );
    const names = r.status === 0 ? r.stdout.split("\n").filter(Boolean) : [];
    stdlibNames = names.length > 100 ? new Set([...names, "sitecustomize", "usercustomize"]) : null;
  }
  return stdlibNames;
}

/** The module name a directory entry would be imported as. */
function moduleNameOf(entry: string): string {
  return entry.replace(/\..*$/, "");
}

/**
 * Does `dir` hold a module file or package that an import of this run could
 * load: one named as a standard-library module (which the code's imports
 * reach directly or through the library itself), or as a module the code
 * imports itself. Without the standard library's list: any such entry.
 */
function moduleLikeIn(dir: string, except: string | null, code: string): boolean {
  const std = stdlibModuleNames();
  const own = new Set(
    [...code.matchAll(/(?:^|[;\n])\s*(?:from\s+([\w.]+)\s+import|import\s+([^;\n]+))/g)].flatMap(
      (m) => (m[1] ? [m[1].split(".")[0]] : m[2].split(",").map((x) => x.trim().split(/[\s.]/)[0])),
    ),
  );
  const shadows = (entry: string) =>
    std === null || std.has(moduleNameOf(entry)) || own.has(moduleNameOf(entry));
  return moduleLikeAt(dir, except, shadows);
}

function moduleLikeAt(
  dir: string,
  except: string | null,
  shadows: (e: string) => boolean,
): boolean {
  let names: fs.Dirent[];
  try {
    names = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return true;
  }
  for (const e of names) {
    const p = path.join(dir, e.name);
    if (except && p === except) {
      continue;
    }
    if (MODULE_FILE.test(e.name)) {
      if (shadows(e.name)) {
        return true;
      }
      continue;
    }
    if ((e.isDirectory() || e.isSymbolicLink()) && shadows(e.name)) {
      try {
        if (fs.readdirSync(p).some((n) => n.startsWith("__init__."))) {
          return true;
        }
      } catch {
        if (e.isSymbolicLink()) {
          return true;
        }
      }
    }
  }
  return false;
}

/** The user's site-packages may run code at start (`usercustomize`, a `.pth`), or cannot be checked. */
function userSiteRuns(home: string | null): boolean {
  if (!home) {
    return true;
  }
  const lib = path.join(home, ".local", "lib");
  let pys: string[];
  try {
    pys = fs.readdirSync(lib).filter((n) => n.startsWith("python3"));
  } catch (err) {
    return (err as NodeJS.ErrnoException)?.code !== "ENOENT";
  }
  for (const py of pys) {
    const site = path.join(lib, py, "site-packages");
    let names: string[];
    try {
      names = fs.readdirSync(site);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
        continue;
      }
      return true;
    }
    if (names.some((n) => /^usercustomize\b|\.pth$/.test(n))) {
      return true;
    }
  }
  return false;
}

/** Can every `import` of this run only load the standard library (see the header)? */
export function importsOnlyStdlib(
  run: PythonRun,
  environment: Readonly<Record<string, string>> | null | undefined,
  home: string | null,
): boolean {
  if (run.isolated) {
    return true;
  }
  if (!environment || Object.keys(environment).some((k) => k.startsWith("PYTHON"))) {
    return false;
  }
  const userHome = environment.HOME ?? home;
  return (
    run.firstPath !== null &&
    !moduleLikeIn(run.firstPath, run.script, run.code) &&
    !userSiteRuns(userHome ?? null)
  );
}
