// The package-install cage, after the run (inside ./contain-init.ts, once
// every contained process has exited, before the install's exit status is
// returned to whoever started it).
//
// During the run (./plan.ts) every existing top-level entry of the project
// is read-only except the install's outputs, its lockfiles and its
// manifest. What mounts cannot express is checked here:
//
//   - a NEW top-level entry is allowed only when it is an output, a
//     lockfile, one of this run's placeholders, or a generated directory the
//     project ignores (not hidden: `dist`, `build`, `*.egg-info`). Anything
//     else (a planted `backdoor.js`, a new `.gitignore` that would hide it)
//     is moved to the quarantine;
//   - a top-level symbolic link (which cannot be bound read-only) must still
//     point where it pointed; otherwise it is put back;
//   - the manifest (package.json) may change only in its dependency fields
//     (npm install <pkg> saving a dependency). Any other change (a new
//     `scripts.test`, a `bin`) is quarantined and the original restored.

import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { ignoredTopLevel, isInstallMetadata, type InstallGuard } from "./plan.js";
import { parseToml, type TomlTable } from "./toml-lite.js";
import { quarantine } from "./view-guard.js";

/**
 * pyproject.toml tables an install may change (uv add, poetry add, pdm add):
 * dotted paths, "*" for any one key.
 */
export const PYPROJECT_DEPENDENCY_PATHS = [
  "project.dependencies",
  "project.optional-dependencies",
  "dependency-groups",
  "tool.poetry.dependencies",
  "tool.poetry.dev-dependencies",
  "tool.poetry.group.*.dependencies",
  "tool.uv.dev-dependencies",
  "tool.pdm.dev-dependencies",
];

/** `t` without the dependency tables (a copy). */
function withoutPyprojectDependencies(t: TomlTable): unknown {
  const copy = structuredClone(t);
  const drop = (node: TomlTable, parts: string[]) => {
    const [head, ...rest] = parts;
    for (const k of head === "*" ? Object.keys(node) : [head]) {
      const v = node[k];
      if (rest.length === 0) {
        delete node[k];
      } else if (v && typeof v === "object" && !Array.isArray(v) && !("raw" in v)) {
        drop(v, rest);
      }
    }
  };
  for (const p of PYPROJECT_DEPENDENCY_PATHS) {
    drop(copy, p.split("."));
  }
  return copy;
}

/** Did only the dependency fields of manifest `name` change? */
export function onlyDependenciesChanged(name: string, before: Buffer, after: Buffer): boolean {
  if (name === "pyproject.toml") {
    try {
      return isDeepStrictEqual(
        withoutPyprojectDependencies(parseToml(before.toString("utf8"))),
        withoutPyprojectDependencies(parseToml(after.toString("utf8"))),
      );
    } catch {
      return false; // unreadable: changed
    }
  }
  const a = parseJson(before);
  const b = parseJson(after);
  return (
    a !== undefined &&
    b !== undefined &&
    isDeepStrictEqual(withoutDependencies(a), withoutDependencies(b))
  );
}

/** package.json fields an install may change. */
export const MANIFEST_DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
  "peerDependenciesMeta",
  "bundleDependencies",
  "bundledDependencies",
];

export type InstallBaseline = Readonly<{
  guard: InstallGuard;
  links: ReadonlyMap<string, string>;
  manifests: ReadonlyMap<string, Buffer>;
}>;

export type InstallViolation = Readonly<{
  path: string;
  what: "new-entry" | "link-changed" | "manifest-changed";
  quarantinedTo: string | null;
}>;

/** What the check compares against: taken just before the install starts. */
export function captureInstallBaseline(guard: InstallGuard): InstallBaseline {
  const links = new Map<string, string>();
  for (const name of guard.existing) {
    const p = path.join(guard.root, name);
    try {
      if (fs.lstatSync(p).isSymbolicLink()) {
        links.set(name, fs.readlinkSync(p));
      }
    } catch {
      /* gone since planning */
    }
  }
  const manifests = new Map<string, Buffer>();
  for (const m of guard.manifests) {
    try {
      manifests.set(m, fs.readFileSync(path.join(guard.root, m)));
    } catch {
      /* gone since planning */
    }
  }
  return { guard, links, manifests };
}

function withoutDependencies(v: unknown): unknown {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    return v;
  }
  const out: Record<string, unknown> = { ...(v as Record<string, unknown>) };
  for (const f of MANIFEST_DEPENDENCY_FIELDS) {
    delete out[f];
  }
  return out;
}

function parseJson(b: Buffer): unknown {
  try {
    return JSON.parse(b.toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * The manifest to put back: the original, with the dependency fields the
 * install wrote (npm's own save survives; everything else is undone).
 */
function restoredManifest(original: Buffer, a: unknown, b: unknown): Buffer {
  const isObject = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);
  if (!isObject(a) || !isObject(b)) {
    return original;
  }
  const merged: Record<string, unknown> = { ...a };
  for (const f of MANIFEST_DEPENDENCY_FIELDS) {
    if (f in b) {
      merged[f] = b[f];
    } else {
      delete merged[f];
    }
  }
  const indent = /^[{[]\r?\n([ \t]+)/.exec(original.toString("utf8"))?.[1] ?? "  ";
  return Buffer.from(`${JSON.stringify(merged, null, indent)}\n`, "utf8");
}

/** Check the project after the install; quarantine and restore what the cage does not allow. */
export function checkInstall(base: InstallBaseline, quarantineDir: string): InstallViolation[] {
  const { guard } = base;
  const out: InstallViolation[] = [];
  const known = new Set([...guard.existing, ...guard.writable, ...guard.ours]);
  let now: string[];
  try {
    now = fs.readdirSync(guard.root);
  } catch {
    return out;
  }
  const fresh = now.filter((e) => !known.has(e) && !isInstallMetadata(e));
  // Hidden names first: a planted `.gitignore` must not decide what else is allowed.
  for (const e of fresh.filter((x) => x.startsWith("."))) {
    const p = path.join(guard.root, e);
    out.push({ path: p, what: "new-entry", quarantinedTo: quarantine(p, quarantineDir) });
  }
  const visible = fresh.filter((x) => !x.startsWith("."));
  if (visible.length > 0) {
    const ignored = ignoredTopLevel(guard.root);
    for (const e of visible) {
      if (!ignored.has(e)) {
        const p = path.join(guard.root, e);
        out.push({ path: p, what: "new-entry", quarantinedTo: quarantine(p, quarantineDir) });
      }
    }
  }
  for (const [name, target] of base.links) {
    const p = path.join(guard.root, name);
    let cur: string | null = null;
    try {
      cur = fs.lstatSync(p).isSymbolicLink() ? fs.readlinkSync(p) : "\0not-a-link";
    } catch {
      cur = null;
    }
    if (cur === target) {
      continue;
    }
    const to = cur === null ? null : quarantine(p, quarantineDir);
    try {
      fs.symlinkSync(target, p);
    } catch {
      /* reported below */
    }
    out.push({ path: p, what: "link-changed", quarantinedTo: to });
  }
  for (const [name, original] of base.manifests) {
    const p = path.join(guard.root, name);
    let cur: Buffer | null = null;
    try {
      cur = fs.readFileSync(p);
    } catch {
      cur = null;
    }
    if (cur !== null && cur.equals(original)) {
      continue;
    }
    if (cur !== null && onlyDependenciesChanged(name, original, cur)) {
      continue; // only dependency fields changed
    }
    const to = cur === null ? null : quarantine(p, quarantineDir);
    // package.json: npm's own dependency save is kept; any other manifest is put back whole.
    fs.writeFileSync(
      p,
      name === "package.json"
        ? restoredManifest(original, parseJson(original), cur === null ? undefined : parseJson(cur))
        : original,
    );
    out.push({ path: p, what: "manifest-changed", quarantinedTo: to });
  }
  return out;
}
