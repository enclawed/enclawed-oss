// What a boot-time module decision was made ABOUT: the install path and the
// content of the manifests that were verified.
//
// The verification map is keyed by plugin id, but an id is only a name: a
// plugin discovered from another root (plugins.load.paths, a global install)
// can carry the same id as a signed bundled plugin. Admission must therefore
// check that the candidate is the very directory, with the very manifests,
// that preload verified; otherwise the candidate would be admitted on another
// plugin's signature.

import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

export type ModuleBinding = Readonly<{
  /** realpath of the verified module directory. */
  rootReal: string;
  /** sha256 over enclawed.module.json and enclawed.plugin.json (each length-prefixed; absent = empty). */
  manifestSha256: string;
}>;

const MANIFEST_FILES = ["enclawed.module.json", "enclawed.plugin.json"] as const;

function readOrEmpty(path: string): Buffer {
  try {
    return readFileSync(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return Buffer.alloc(0);
    }
    throw err;
  }
}

/** Compute the binding for a module directory. Throws when the directory cannot be resolved. */
export function computeModuleBinding(moduleDir: string): ModuleBinding {
  const rootReal = realpathSync(moduleDir);
  const h = createHash("sha256");
  for (const name of MANIFEST_FILES) {
    const bytes = readOrEmpty(join(rootReal, name));
    h.update(`${name}\0${bytes.length}\0`);
    h.update(bytes);
  }
  return Object.freeze({ rootReal, manifestSha256: h.digest("hex") });
}

const BINDINGS_KEY = Symbol.for("enclawed.module-bindings");
type GlobalWithBindings = typeof globalThis & {
  [BINDINGS_KEY]?: ReadonlyMap<string, ModuleBinding>;
};

export function setModuleBindings(bindings: ReadonlyMap<string, ModuleBinding>): void {
  (globalThis as GlobalWithBindings)[BINDINGS_KEY] = bindings;
}

export function getModuleBinding(id: string): ModuleBinding | undefined {
  return (globalThis as GlobalWithBindings)[BINDINGS_KEY]?.get(id);
}

export function clearModuleBindings(): void {
  delete (globalThis as GlobalWithBindings)[BINDINGS_KEY];
}

export type BindingCheck =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: string; expected: ModuleBinding; actual: ModuleBinding | null }>;

/** Compare a candidate directory against the binding recorded for its id. */
export function checkModuleBinding(expected: ModuleBinding, candidateDir: string): BindingCheck {
  let actual: ModuleBinding;
  try {
    actual = computeModuleBinding(candidateDir);
  } catch (err) {
    return {
      ok: false,
      reason: `cannot resolve ${candidateDir}: ${(err as Error).message}`,
      expected,
      actual: null,
    };
  }
  if (actual.rootReal !== expected.rootReal) {
    return {
      ok: false,
      reason: `loaded from ${actual.rootReal}, but the verified plugin with this id is at ${expected.rootReal}`,
      expected,
      actual,
    };
  }
  if (actual.manifestSha256 !== expected.manifestSha256) {
    return {
      ok: false,
      reason: `its manifests changed since they were verified at boot`,
      expected,
      actual,
    };
  }
  return { ok: true };
}
