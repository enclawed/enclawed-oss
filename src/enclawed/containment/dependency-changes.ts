// What a contained run changed inside the project's dependency trees.
//
// A contained run (a build, a project script) may rewrite installed
// dependency code: a package under node_modules, a module in a virtual
// environment's site-packages. History keeps it (it is reversible), but IDE
// tooling loads that code implicitly (an editor's ESLint loads its plugins
// from node_modules, a language server imports from the virtual
// environment). Not refused (a native addon's build writes
// node_modules/<pkg>/build/), but reported after the run: each file of a
// dependency tree whose inode the run created or opened for writing
// (the name guard's journal), less a package's own build tree and the
// package managers' and bundlers' caches.

import fs from "node:fs";
import path from "node:path";
import { inodeKey } from "./name-guard.js";

const DEPENDENCY_DIRS = new Set(["node_modules", "site-packages", "dist-packages"]);
const SKIP_DIRS = new Set([".git", ".cache", ".vite", ".pnpm-store"]);
const MAX_ENTRIES = 200_000;
const MAX_REPORTED = 200;

/** Is `rel` (inside a dependency tree, its components below the tree) a package's own build output? */
function packageBuild(parts: readonly string[]): boolean {
  // <pkg>/build/... or @scope/<pkg>/build/...
  const i = parts[0]?.startsWith("@") ? 2 : 1;
  return parts.length > i && parts[i] === "build";
}

/**
 * The files (real paths, sorted) inside a dependency tree of `roots` whose
 * inode is in `written` (the journal's keys). Capped: `more` counts the rest.
 */
export function dependencyChanges(
  roots: readonly string[],
  written: ReadonlySet<string>,
): { files: string[]; more: number } {
  const out: string[] = [];
  if (written.size === 0) {
    return { files: out, more: 0 };
  }
  let budget = MAX_ENTRIES;
  const walk = (dir: string, inTree: string[] | null) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (--budget < 0) {
        return;
      }
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) {
          continue;
        }
        if (inTree) {
          walk(p, [...inTree, e.name]);
        } else {
          walk(p, DEPENDENCY_DIRS.has(e.name) ? [] : null);
        }
      } else if (e.isFile() && inTree && !packageBuild([...inTree, e.name])) {
        try {
          if (written.has(inodeKey(fs.statSync(p, { bigint: true })))) {
            out.push(p);
          }
        } catch {
          /* gone */
        }
      }
    }
  };
  for (const r of roots) {
    walk(r, null);
  }
  out.sort();
  return { files: out.slice(0, MAX_REPORTED), more: Math.max(0, out.length - MAX_REPORTED) };
}

/**
 * The mark a virtual environment carries after a contained run (not an
 * install) changed its installed packages anyway: a contained run of that
 * environment's Python no longer trusts them (./contained-exec.ts projectVenv)
 * until a decided install into it, or the person, clears it. No contained run
 * writes it (the name guard refuses it, like the environment's packages).
 */
export const VENV_TAINT_MARK = ".enclawed-tainted";

/** The virtual environment (a directory holding pyvenv.cfg) `file` is inside, or null. */
function venvOf(file: string, roots: readonly string[]): string | null {
  let d = path.dirname(file);
  while (roots.some((r) => d === r || d.startsWith(`${r}/`))) {
    if (fs.existsSync(path.join(d, "pyvenv.cfg"))) {
      return d;
    }
    const up = path.dirname(d);
    if (up === d) {
      break;
    }
    d = up;
  }
  return null;
}

/** Mark the virtual environments whose packages `files` (changed by a run) belong to. */
export function markVenvTaint(files: readonly string[], roots: readonly string[]): string[] {
  const venvs = [
    ...new Set(files.map((f) => venvOf(f, roots)).filter((v): v is string => v !== null)),
  ];
  for (const v of venvs) {
    try {
      fs.writeFileSync(
        path.join(v, VENV_TAINT_MARK),
        `A contained run changed these installed packages (${new Date().toISOString()}):\n${files
          .filter((f) => f.startsWith(`${v}/`))
          .map((f) => `  ${f}`)
          .join(
            "\n",
          )}\nReinstall them (a decided install into this environment removes this file), or remove this file after checking them.\n`,
        { mode: 0o644 },
      );
    } catch {
      /* the environment is gone */
    }
  }
  return venvs.toSorted();
}

/** The virtual environments `files` belong to. */
export function venvsOf(files: readonly string[], roots: readonly string[]): string[] {
  return [
    ...new Set(files.map((f) => venvOf(f, roots)).filter((v): v is string => v !== null)),
  ].toSorted();
}

/** A decided install wrote these environments' packages: their marks are cleared. */
export function clearVenvTaint(files: readonly string[], roots: readonly string[]): void {
  for (const v of new Set(
    files.map((f) => venvOf(f, roots)).filter((x): x is string => x !== null),
  )) {
    fs.rmSync(path.join(v, VENV_TAINT_MARK), { force: true });
  }
}
