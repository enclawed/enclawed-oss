// Disk-aware adapter around src/enclawed/module-loader.ts. Reads
// `enclawed.module.json` from a module directory, parses + verifies it,
// and returns the load decision. Used by the upstream module loader to
// gate every module before any of its code is imported.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { getFlavor } from "../flavor.js";
import { checkModule, type ModuleDecision } from "../module-loader.js";
import {
  type ClearanceLevel,
  parseManifest,
  type ModuleManifest,
} from "../module-manifest.js";
import { getRuntime } from "../runtime.js";

const MANIFEST_FILENAME = "enclawed.module.json";

export async function loadModuleManifest(
  moduleDir: string,
): Promise<ModuleManifest | null> {
  try {
    const raw = await readFile(join(moduleDir, MANIFEST_FILENAME), "utf8");
    return parseManifest(JSON.parse(raw));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

export type VerifyOpts = { requiredClearance?: ClearanceLevel };

export async function verifyModuleAtPath(
  moduleDir: string,
  opts?: VerifyOpts,
): Promise<ModuleDecision> {
  const flavor = getFlavor();
  const manifest = await loadModuleManifest(moduleDir);
  if (!manifest) {
    // No manifest. In the enclaved flavor this is a hard deny; in the
    // open flavor we synthesize a permissive decision so vanilla Enclawed
    // modules continue to work.
    if (flavor === "enclaved") {
      const decision: ModuleDecision = {
        allowed: false,
        flavor,
        reason: `enclaved flavor: module at ${moduleDir} has no ${MANIFEST_FILENAME}`,
      };
      const rt = getRuntime();
      if (rt) {
        rt.audit
          .append({
            type: "module.decision",
            actor: moduleDir,
            level: null,
            payload: { decision, flavor, reason: "missing-manifest" },
          })
          .catch(() => {});
      }
      return decision;
    }
    return {
      allowed: true,
      flavor,
      clearance: "unclassified",
      signerKeyId: null,
      warnings: Object.freeze([
        `module at ${moduleDir} has no ${MANIFEST_FILENAME} (open mode: warn-only)`,
      ]),
    };
  }
  return checkModule(manifest, { requiredClearance: opts?.requiredClearance, flavor });
}
