import { describe, expect, it, vi } from "vitest";
import type { PluginManifestRegistry } from "../plugins/manifest-registry.js";
import { validateConfigObjectWithPlugins } from "./validation.js";

const mockLoadPluginManifestRegistry = vi.hoisted(() =>
  vi.fn((): PluginManifestRegistry => ({
    diagnostics: [],
    plugins: [],
  })),
);

vi.mock("../plugins/manifest-registry.js", () => ({
  loadPluginManifestRegistry: () => mockLoadPluginManifestRegistry(),
  resolveManifestContractPluginIds: () => [],
}));

vi.mock("../plugins/doctor-contract-registry.js", () => ({
  collectRelevantDoctorPluginIds: () => [],
  listPluginDoctorLegacyConfigRules: () => [],
  applyPluginDoctorCompatibilityMigrations: () => ({ next: null, changes: [] }),
}));

vi.mock("../channels/plugins/legacy-config.js", () => ({
  collectChannelLegacyConfigRules: () => [],
}));

vi.mock("./zod-schema.js", () => ({
  EnclawedSchema: {
    safeParse: (raw: unknown) => ({ success: true, data: raw }),
  },
}));

describe("validateConfigObjectWithPlugins removed plugin ids", () => {
  it("loads a config whose plugins.deny names a removed provider plugin, keeping the deny entry", () => {
    const result = validateConfigObjectWithPlugins({
      plugins: { deny: ["minimax", "zai"], allow: ["qwen"], entries: { moonshot: {} } },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.config.plugins?.deny).toEqual(["minimax", "zai"]);
    const messages = result.warnings.map((warning) => warning.message);
    expect(messages).toContain(
      "plugin removed: minimax (stale config entry ignored; remove it from plugins config)",
    );
    expect(messages).toContain(
      "plugin removed: qwen (stale config entry ignored; remove it from plugins config)",
    );
    expect(messages).toContain(
      "plugin removed: moonshot (stale config entry ignored; remove it from plugins config)",
    );
  });

  it("loads a config whose plugins entries name the removed zalouser channel plugin", () => {
    const result = validateConfigObjectWithPlugins({
      plugins: { deny: ["zalouser"], entries: { zalouser: {} } },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.config.plugins?.deny).toEqual(["zalouser"]);
    expect(result.warnings.map((warning) => warning.message)).toContain(
      "plugin removed: zalouser (stale config entry ignored; remove it from plugins config)",
    );
  });

  it("still rejects an unknown plugin id in plugins.deny", () => {
    const result = validateConfigObjectWithPlugins({
      plugins: { deny: ["not-a-real-plugin"] },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.issues.map((issue) => issue.message)).toContain(
      "plugin not found: not-a-real-plugin",
    );
  });
});
