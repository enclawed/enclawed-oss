// Boot-time module manifest pre-verification.
//
// Walks the modules root directory, parses every `enclawed.module.json` it
// finds, runs each through checkModule() against the active flavor + trust
// root, and returns the decisions keyed by module id. The bootstrap stashes
// the resulting Map on the runtime singleton so the synchronous plugin
// validation chokepoints (channel-validation, provider-validation) can
// query the verified state without doing async I/O on a hot path.

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import type { ModuleDecision } from "../module-loader.js";
import { loadModuleManifest, verifyModuleAtPath } from "./module-loader-shim.js";

export const DEFAULT_MODULES_ROOT = "extensions";

// Read the plugin's registry id from enclawed.plugin.json, if present. This is
// the id the host plugin registry uses for admission lookups, which can differ
// from the directory name / module-manifest id for a few bundled plugins.
async function readPluginManifestId(moduleDir: string): Promise<string | null> {
  try {
    const raw = await readFile(join(moduleDir, "enclawed.plugin.json"), "utf8");
    const parsed = JSON.parse(raw) as { id?: unknown };
    return typeof parsed.id === "string" && parsed.id.length > 0 ? parsed.id : null;
  } catch {
    return null;
  }
}

export type ModuleVerificationMap = ReadonlyMap<string, ModuleDecision>;

export async function preloadModuleDecisions(
  rootDir: string = DEFAULT_MODULES_ROOT,
): Promise<ModuleVerificationMap> {
  const out = new Map<string, ModuleDecision>();
  let entries: Array<{ name: string; isDirectory(): boolean }>;
  try {
    entries = await readdir(rootDir, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return out;
    throw e;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const moduleDir = join(rootDir, ent.name);
    try {
      const decision = await verifyModuleAtPath(moduleDir);
      // Index the decision under every id the plugin registry might look it
      // up by: the directory name, the module-manifest id (which the signing
      // convention pins to the directory name), and the plugin's own
      // enclawed.plugin.json id. These usually coincide, but a few bundled
      // plugins use a directory name that differs from their plugin id (e.g.
      // dir "kimi-coding" → plugin id "kimi"). admitPluginCandidate queries by
      // the plugin id, so without the alias the decision would be missed and
      // the plugin would warn as if unsigned. Setting all distinct keys to the
      // same decision is safe — it only widens lookup, never overrides.
      const keys = new Set<string>([ent.name]);
      const manifest = await loadModuleManifest(moduleDir);
      if (manifest) keys.add(manifest.id);
      const pluginId = await readPluginManifestId(moduleDir);
      if (pluginId) keys.add(pluginId);
      for (const key of keys) {
        out.set(key, decision);
      }
    } catch (e) {
      out.set(ent.name, {
        allowed: false,
        flavor: "enclaved",
        reason: `manifest parse error: ${(e as Error).message}`,
      });
    }
  }
  return out;
}
