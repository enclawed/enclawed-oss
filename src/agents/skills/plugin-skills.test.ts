import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { EnclawedConfig } from "../../config/config.js";
import type { PluginManifestRegistry } from "../../plugins/manifest-registry.js";
import { createTrackedTempDirs } from "../../test-utils/tracked-temp-dirs.js";

const hoisted = vi.hoisted(() => ({
  loadPluginManifestRegistry: vi.fn(),
}));

vi.mock("../../plugins/manifest-registry.js", () => ({
  loadPluginManifestRegistry: (...args: unknown[]) => hoisted.loadPluginManifestRegistry(...args),
}));

let resolvePluginSkillDirs: typeof import("./plugin-skills.js").resolvePluginSkillDirs;

const tempDirs = createTrackedTempDirs();

function buildRegistry(params: { acpxRoot: string; helperRoot: string }): PluginManifestRegistry {
  return {
    diagnostics: [],
    plugins: [
      {
        id: "acpx",
        name: "ACPX Runtime",
        channels: [],
        providers: [],
        cliBackends: [],
        skills: ["./skills"],
        hooks: [],
        origin: "workspace",
        rootDir: params.acpxRoot,
        source: params.acpxRoot,
        manifestPath: path.join(params.acpxRoot, "enclawed.plugin.json"),
      },
      {
        id: "helper",
        name: "Helper",
        channels: [],
        providers: [],
        cliBackends: [],
        skills: ["./skills"],
        hooks: [],
        origin: "workspace",
        rootDir: params.helperRoot,
        source: params.helperRoot,
        manifestPath: path.join(params.helperRoot, "enclawed.plugin.json"),
      },
    ],
  };
}

function createSinglePluginRegistry(params: {
  pluginRoot: string;
  skills: string[];
  format?: "enclawed" | "bundle";
  legacyPluginIds?: string[];
}): PluginManifestRegistry {
  return {
    diagnostics: [],
    plugins: [
      {
        id: "helper",
        name: "Helper",
        format: params.format,
        channels: [],
        providers: [],
        cliBackends: [],
        legacyPluginIds: params.legacyPluginIds,
        skills: params.skills,
        hooks: [],
        origin: "workspace",
        rootDir: params.pluginRoot,
        source: params.pluginRoot,
        manifestPath: path.join(params.pluginRoot, "enclawed.plugin.json"),
      },
    ],
  };
}

async function setupAcpxAndHelperRegistry() {
  const workspaceDir = await tempDirs.make("enclawed-");
  const acpxRoot = await tempDirs.make("enclawed-acpx-plugin-");
  const helperRoot = await tempDirs.make("enclawed-helper-plugin-");
  await fs.mkdir(path.join(acpxRoot, "skills"), { recursive: true });
  await fs.mkdir(path.join(helperRoot, "skills"), { recursive: true });
  hoisted.loadPluginManifestRegistry.mockReturnValue(buildRegistry({ acpxRoot, helperRoot }));
  return { workspaceDir, acpxRoot, helperRoot };
}

async function setupPluginOutsideSkills() {
  const workspaceDir = await tempDirs.make("enclawed-");
  const pluginRoot = await tempDirs.make("enclawed-plugin-");
  const outsideDir = await tempDirs.make("enclawed-outside-");
  const outsideSkills = path.join(outsideDir, "skills");
  return { workspaceDir, pluginRoot, outsideSkills };
}

afterEach(async () => {
  hoisted.loadPluginManifestRegistry.mockReset();
  await tempDirs.cleanup();
});

describe("resolvePluginSkillDirs", () => {
  beforeAll(async () => {
    ({ resolvePluginSkillDirs } = await import("./plugin-skills.js"));
  });

  beforeEach(() => {
    hoisted.loadPluginManifestRegistry.mockReset();
  });

  it.each([
    {
      name: "keeps acpx plugin skills when ACP is enabled",
      acpEnabled: true,
      expectedDirs: ({ acpxRoot, helperRoot }: { acpxRoot: string; helperRoot: string }) => [
        path.resolve(acpxRoot, "skills"),
        path.resolve(helperRoot, "skills"),
      ],
    },
    {
      name: "skips acpx plugin skills when ACP is disabled",
      acpEnabled: false,
      expectedDirs: ({ helperRoot }: { acpxRoot: string; helperRoot: string }) => [
        path.resolve(helperRoot, "skills"),
      ],
    },
  ])("$name", async ({ acpEnabled, expectedDirs }) => {
    const { workspaceDir, acpxRoot, helperRoot } = await setupAcpxAndHelperRegistry();

    const dirs = resolvePluginSkillDirs({
      workspaceDir,
      config: {
        acp: { enabled: acpEnabled },
        plugins: {
          entries: {
            acpx: { enabled: true },
            helper: { enabled: true },
          },
        },
      } as EnclawedConfig,
    });

    expect(dirs).toEqual(expectedDirs({ acpxRoot, helperRoot }));
  });

  it("rejects plugin skill paths that escape the plugin root", async () => {
    const { workspaceDir, pluginRoot, outsideSkills } = await setupPluginOutsideSkills();
    await fs.mkdir(path.join(pluginRoot, "skills"), { recursive: true });
    await fs.mkdir(outsideSkills, { recursive: true });
    const escapePath = path.relative(pluginRoot, outsideSkills);

    hoisted.loadPluginManifestRegistry.mockReturnValue(
      createSinglePluginRegistry({
        pluginRoot,
        skills: ["./skills", escapePath],
      }),
    );

    const dirs = resolvePluginSkillDirs({
      workspaceDir,
      config: {
        plugins: {
          entries: {
            helper: { enabled: true },
          },
        },
      } as EnclawedConfig,
    });

    expect(dirs).toEqual([path.resolve(pluginRoot, "skills")]);
  });

  it("rejects plugin skill symlinks that resolve outside plugin root", async () => {
    const { workspaceDir, pluginRoot, outsideSkills } = await setupPluginOutsideSkills();
    const linkPath = path.join(pluginRoot, "skills-link");
    await fs.mkdir(outsideSkills, { recursive: true });
    await fs.symlink(
      outsideSkills,
      linkPath,
      process.platform === "win32" ? ("junction" as const) : ("dir" as const),
    );

    hoisted.loadPluginManifestRegistry.mockReturnValue(
      createSinglePluginRegistry({
        pluginRoot,
        skills: ["./skills-link"],
      }),
    );

    const dirs = resolvePluginSkillDirs({
      workspaceDir,
      config: {
        plugins: {
          entries: {
            helper: { enabled: true },
          },
        },
      } as EnclawedConfig,
    });

    expect(dirs).toEqual([]);
  });

  it("resolves Claude bundle command roots through the normal plugin skill path", async () => {
    const workspaceDir = await tempDirs.make("enclawed-");
    const pluginRoot = await tempDirs.make("enclawed-claude-bundle-");
    await fs.mkdir(path.join(pluginRoot, "commands"), { recursive: true });
    await fs.mkdir(path.join(pluginRoot, "skills"), { recursive: true });

    hoisted.loadPluginManifestRegistry.mockReturnValue(
      createSinglePluginRegistry({
        pluginRoot,
        format: "bundle",
        skills: ["./skills", "./commands"],
      }),
    );

    const dirs = resolvePluginSkillDirs({
      workspaceDir,
      config: {
        plugins: {
          entries: {
            helper: { enabled: true },
          },
        },
      } as EnclawedConfig,
    });

    expect(dirs).toEqual([
      path.resolve(pluginRoot, "skills"),
      path.resolve(pluginRoot, "commands"),
    ]);
  });

  it("resolves enabled plugin skills through legacy manifest aliases", async () => {
    const workspaceDir = await tempDirs.make("enclawed-");
    const pluginRoot = await tempDirs.make("enclawed-legacy-plugin-");
    await fs.mkdir(path.join(pluginRoot, "skills"), { recursive: true });

    hoisted.loadPluginManifestRegistry.mockReturnValue(
      createSinglePluginRegistry({
        pluginRoot,
        skills: ["./skills"],
        legacyPluginIds: ["helper-legacy"],
      }),
    );

    const dirs = resolvePluginSkillDirs({
      workspaceDir,
      config: {
        plugins: {
          entries: {
            "helper-legacy": { enabled: true },
          },
        },
      } as EnclawedConfig,
    });

    expect(dirs).toEqual([path.resolve(pluginRoot, "skills")]);
  });
});
