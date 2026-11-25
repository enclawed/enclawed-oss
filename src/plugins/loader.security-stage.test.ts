import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { clearPluginLoaderCache, loadEnclawedPlugins } from "./loader.js";
import { resolveManifestSecurityStage } from "./manifest.js";
import { assertSecurityStagePluginsLoaded, PluginSecurityStageError } from "./security-stage.js";
import { cleanupTrackedTempDirs, makeTrackedTempDir } from "./test-helpers/fs-fixtures.js";

// Settings audit X1: an invalid config for a security plugin used to skip the
// plugin while the gateway kept running. These cases pin the refusal.

const tempDirs: string[] = [];
const root = makeTrackedTempDir("enclawed-plugin-security-stage", tempDirs);
let index = 0;
const savedBundledDir = process.env.ENCLAWED_BUNDLED_PLUGINS_DIR;

afterAll(() => cleanupTrackedTempDirs(tempDirs));
afterEach(() => {
  if (savedBundledDir === undefined) {
    delete process.env.ENCLAWED_BUNDLED_PLUGINS_DIR;
  } else {
    process.env.ENCLAWED_BUNDLED_PLUGINS_DIR = savedBundledDir;
  }
});

const BOUNDED_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { limit: { type: "integer", minimum: 1, maximum: 10 } },
};

function writePlugin(params: {
  id: string;
  manifest?: Record<string, unknown>;
  body?: string;
}): string {
  const dir = path.join(root, `case-${index++}`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${params.id}.cjs`);
  fs.writeFileSync(
    file,
    params.body ?? `module.exports = { id: ${JSON.stringify(params.id)}, register() {} };`,
  );
  fs.writeFileSync(
    path.join(dir, "enclawed.plugin.json"),
    JSON.stringify({ id: params.id, configSchema: BOUNDED_SCHEMA, ...params.manifest }),
  );
  return file;
}

function load(file: string, id: string, config: unknown) {
  process.env.ENCLAWED_BUNDLED_PLUGINS_DIR = "/nonexistent/bundled/plugins";
  clearPluginLoaderCache();
  return loadEnclawedPlugins({
    cache: false,
    config: {
      plugins: {
        enabled: true,
        load: { paths: [file] },
        allow: [id],
        entries: { [id]: { enabled: true, config } as never },
      },
    },
    logger: { info: () => {}, debug: () => {}, error: () => {}, warn: () => {} },
  });
}

describe("security-stage plugins refuse gateway start on error", () => {
  it("attack: invalid config for a securityStage plugin refuses start", () => {
    const file = writePlugin({ id: "sec-stage", manifest: { securityStage: true } });
    const registry = load(file, "sec-stage", { limit: 1e9 });
    expect(registry.plugins.find((p) => p.id === "sec-stage")?.status).toBe("error");
    expect(() => assertSecurityStagePluginsLoaded(registry)).toThrow(PluginSecurityStageError);
    expect(() => assertSecurityStagePluginsLoaded(registry)).toThrow(/sec-stage: invalid config/);
  });

  it("attack: a plugin a security profile enables by default is a security stage", () => {
    const file = writePlugin({
      id: "profile-stage",
      manifest: { enabledByDefaultInFlavors: ["enclaved"] },
    });
    const registry = load(file, "profile-stage", { limit: "ten" });
    expect(() => assertSecurityStagePluginsLoaded(registry)).toThrow(/profile-stage/);
  });

  it("attack: a register() throw in a security stage refuses start", () => {
    const file = writePlugin({
      id: "sec-throws",
      manifest: { securityStage: true },
      body: `module.exports = { id: "sec-throws", register() { throw new Error("boom"); } };`,
    });
    const registry = load(file, "sec-throws", {});
    expect(() => assertSecurityStagePluginsLoaded(registry)).toThrow(/sec-throws/);
  });

  it("FP: a security stage with valid config starts", () => {
    const file = writePlugin({ id: "sec-ok", manifest: { securityStage: true } });
    const registry = load(file, "sec-ok", { limit: 5 });
    expect(registry.plugins.find((p) => p.id === "sec-ok")?.status).toBe("loaded");
    expect(() => assertSecurityStagePluginsLoaded(registry)).not.toThrow();
  });

  it("FP: a non-security plugin with invalid config keeps today's skip-and-report", () => {
    const file = writePlugin({ id: "plain" });
    const registry = load(file, "plain", { limit: 1e9 });
    expect(registry.plugins.find((p) => p.id === "plain")?.status).toBe("error");
    expect(() => assertSecurityStagePluginsLoaded(registry)).not.toThrow();
  });

  it("marker parsing: only true or a non-empty flavor list counts", () => {
    expect(resolveManifestSecurityStage({ securityStage: true })).toBe(true);
    expect(resolveManifestSecurityStage({ enabledByDefaultInFlavors: ["enclaved"] })).toBe(true);
    expect(resolveManifestSecurityStage({})).toBe(false);
    expect(resolveManifestSecurityStage({ securityStage: false })).toBe(false);
    expect(resolveManifestSecurityStage({ enabledByDefaultInFlavors: [] })).toBe(false);
  });
});
