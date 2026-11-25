import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { EnclawedRuntime } from "../enclawed/runtime.js";
import { clearRuntime, getRuntime, setRuntime } from "../enclawed/runtime.js";
import { normalizePluginsConfig, resolvePluginActivationState } from "./config-state.js";
import { loadPluginManifest, resolveManifestEnabledByDefault } from "./manifest.js";
import { cleanupTrackedTempDirs, makeTrackedTempDir } from "./test-helpers/fs-fixtures.js";

const tempDirs: string[] = [];
const priorRuntime = getRuntime();

function withFlavor(flavor: "open" | "enclaved"): void {
  setRuntime({ flavor } as unknown as EnclawedRuntime);
}

afterEach(() => {
  cleanupTrackedTempDirs(tempDirs);
  if (priorRuntime) {
    setRuntime(priorRuntime);
  } else {
    clearRuntime();
  }
});

// The lossless covert-channel stages and the mediator ship on by default in
// the enclaved flavor (audit row 6). They name the flavor in their manifest;
// core stays plugin-agnostic.
const ENCLAVED_DEFAULT_ON = [
  "egress-mediator",
  "egress-canonicalizer",
  "egress-taint-tracker",
  "egress-action-batcher",
];

describe("enabledByDefaultInFlavors", () => {
  it("resolves against the active flavor", () => {
    const raw = { enabledByDefaultInFlavors: ["enclaved"] };
    withFlavor("enclaved");
    expect(resolveManifestEnabledByDefault(raw)).toBe(true);
    withFlavor("open");
    expect(resolveManifestEnabledByDefault(raw)).toBe(false);
    expect(resolveManifestEnabledByDefault({ enabledByDefault: true })).toBe(true);
    expect(resolveManifestEnabledByDefault({ enabledByDefaultInFlavors: "enclaved" })).toBe(false);
  });

  it("loads into enabledByDefault and default-enables a bundled plugin", () => {
    const dir = makeTrackedTempDir("enclawed-manifest-flavor", tempDirs);
    fs.writeFileSync(
      path.join(dir, "enclawed.plugin.json"),
      JSON.stringify({
        id: "demo-guard",
        enabledByDefaultInFlavors: ["enclaved"],
        configSchema: { type: "object" },
      }),
    );
    withFlavor("enclaved");
    const res = loadPluginManifest(dir, false);
    expect(res.ok).toBe(true);
    if (!res.ok) {
      return;
    }
    expect(res.manifest.enabledByDefault).toBe(true);
    const state = resolvePluginActivationState({
      id: "demo-guard",
      origin: "bundled",
      config: normalizePluginsConfig({}),
      enabledByDefault: res.manifest.enabledByDefault,
    });
    expect(state.enabled).toBe(true);
  });

  it("ships the mediator and the lossless stages on by default in enclaved only", () => {
    const root = path.resolve(__dirname, "../../extensions");
    for (const id of ENCLAVED_DEFAULT_ON) {
      withFlavor("enclaved");
      const enclaved = loadPluginManifest(path.join(root, id), false);
      expect(enclaved.ok && enclaved.manifest.enabledByDefault, id).toBe(true);
      withFlavor("open");
      const open = loadPluginManifest(path.join(root, id), false);
      expect(open.ok && open.manifest.enabledByDefault === true, id).toBe(false);
    }
  });
});
