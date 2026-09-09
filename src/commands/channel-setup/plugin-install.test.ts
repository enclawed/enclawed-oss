import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bundledPluginRoot,
  bundledPluginRootAt,
} from "../../../test/helpers/bundled-plugin-paths.js";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  const existsSync = vi.fn();
  return {
    ...actual,
    existsSync,
    default: {
      ...actual,
      existsSync,
    },
  };
});

const installPluginFromNpmSpec = vi.fn();
const applyPluginAutoEnable = vi.fn();
vi.mock("../../plugins/install.js", () => ({
  installPluginFromNpmSpec: (...args: unknown[]) => installPluginFromNpmSpec(...args),
}));

vi.mock("../../config/plugin-auto-enable.js", () => ({
  applyPluginAutoEnable: (...args: unknown[]) => applyPluginAutoEnable(...args),
}));

const resolveBundledPluginSources = vi.fn();
const getChannelPluginCatalogEntry = vi.fn();
const listChannelPluginCatalogEntries = vi.fn((..._args: unknown[]) => []);
vi.mock("../../channels/plugins/catalog.js", () => {
  return {
    getChannelPluginCatalogEntry: (...args: unknown[]) => getChannelPluginCatalogEntry(...args),
    listChannelPluginCatalogEntries: (...args: unknown[]) =>
      listChannelPluginCatalogEntries(...args),
  };
});

const loadPluginManifestRegistry = vi.fn();
vi.mock("../../plugins/manifest-registry.js", () => ({
  loadPluginManifestRegistry: (...args: unknown[]) => loadPluginManifestRegistry(...args),
}));

vi.mock("../../plugins/bundled-sources.js", () => ({
  findBundledPluginSourceInMap: ({
    bundled,
    lookup,
  }: {
    bundled: ReadonlyMap<string, { pluginId: string; localPath: string; npmSpec?: string }>;
    lookup: { kind: "pluginId" | "npmSpec"; value: string };
  }) => {
    const targetValue = lookup.value.trim();
    if (!targetValue) {
      return undefined;
    }
    if (lookup.kind === "pluginId") {
      return bundled.get(targetValue);
    }
    for (const source of bundled.values()) {
      if (source.npmSpec === targetValue) {
        return source;
      }
    }
    return undefined;
  },
  resolveBundledPluginSources: (...args: unknown[]) => resolveBundledPluginSources(...args),
}));

vi.mock("../../plugins/loader.js", () => ({
  loadEnclawedPlugins: vi.fn(),
}));

const clearPluginDiscoveryCache = vi.fn();
vi.mock("../../plugins/discovery.js", () => ({
  clearPluginDiscoveryCache: () => clearPluginDiscoveryCache(),
}));

import fs from "node:fs";
import type { ChannelPluginCatalogEntry } from "../../channels/plugins/catalog.js";
import type { EnclawedConfig } from "../../config/config.js";
import { loadEnclawedPlugins } from "../../plugins/loader.js";
import { createEmptyPluginRegistry } from "../../plugins/registry.js";
import {
  pinActivePluginChannelRegistry,
  releasePinnedPluginChannelRegistry,
  setActivePluginRegistry,
} from "../../plugins/runtime.js";
import { createPluginRecord } from "../../plugins/status.test-helpers.js";
import type { WizardPrompter } from "../../wizard/prompts.js";
import { makePrompter, makeRuntime } from "../setup/__tests__/test-utils.js";
import {
  ensureChannelSetupPluginInstalled,
  loadChannelSetupPluginRegistrySnapshotForChannel,
  reloadChannelSetupPluginRegistry,
  reloadChannelSetupPluginRegistryForChannel,
} from "./plugin-install.js";

const baseEntry: ChannelPluginCatalogEntry = {
  id: "zalo",
  pluginId: "zalo",
  meta: {
    id: "zalo",
    label: "Zalo",
    selectionLabel: "Zalo (Bot API)",
    docsPath: "/channels/zalo",
    docsLabel: "zalo",
    blurb: "Test",
  },
  install: {
    npmSpec: "@enclawed/zalo",
    localPath: bundledPluginRoot("zalo"),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  applyPluginAutoEnable.mockImplementation((params: { config: unknown }) => ({
    config: params.config,
    changes: [],
    autoEnabledReasons: {},
  }));
  resolveBundledPluginSources.mockReturnValue(new Map());
  getChannelPluginCatalogEntry.mockReturnValue(undefined);
  listChannelPluginCatalogEntries.mockReturnValue([]);
  loadPluginManifestRegistry.mockReturnValue({ plugins: [], diagnostics: [] });
  setActivePluginRegistry(createEmptyPluginRegistry());
});

function mockRepoLocalPathExists() {
  vi.mocked(fs.existsSync).mockImplementation((value) => {
    const raw = String(value);
    return raw.endsWith(`${path.sep}.git`) || raw.endsWith(`${path.sep}extensions${path.sep}zalo`);
  });
}

async function runInitialValueForChannel(channel: "dev" | "beta") {
  const runtime = makeRuntime();
  const select = vi.fn((async <T extends string>() => "skip" as T) as WizardPrompter["select"]);
  const prompter = makePrompter({ select: select as unknown as WizardPrompter["select"] });
  const cfg: EnclawedConfig = { update: { channel } };
  mockRepoLocalPathExists();

  await ensureChannelSetupPluginInstalled({
    cfg,
    entry: baseEntry,
    prompter,
    runtime,
  });

  const call = select.mock.calls[0];
  return call?.[0]?.initialValue;
}

function expectPluginLoadedFromLocalPath(
  result: Awaited<ReturnType<typeof ensureChannelSetupPluginInstalled>>,
) {
  const expectedPath = path.resolve(process.cwd(), bundledPluginRoot("zalo"));
  expect(result.installed).toBe(true);
  expect(result.cfg.plugins?.load?.paths).toContain(expectedPath);
}

describe("ensureChannelSetupPluginInstalled", () => {
  it("installs from npm and enables the plugin", async () => {
    const runtime = makeRuntime();
    const prompter = makePrompter({
      select: vi.fn(async () => "npm") as WizardPrompter["select"],
    });
    const cfg: EnclawedConfig = { plugins: { allow: ["other"] } };
    vi.mocked(fs.existsSync).mockReturnValue(false);
    installPluginFromNpmSpec.mockResolvedValue({
      ok: true,
      pluginId: "zalo",
      targetDir: "/tmp/zalo",
      extensions: [],
    });

    const result = await ensureChannelSetupPluginInstalled({
      cfg,
      entry: baseEntry,
      prompter,
      runtime,
    });

    expect(result.installed).toBe(true);
    expect(result.cfg.plugins?.entries?.zalo?.enabled).toBe(true);
    expect(result.cfg.plugins?.allow).toContain("zalo");
    expect(result.cfg.plugins?.installs?.zalo?.source).toBe("npm");
    expect(result.cfg.plugins?.installs?.zalo?.spec).toBe("@enclawed/zalo");
    expect(result.cfg.plugins?.installs?.zalo?.installPath).toBe("/tmp/zalo");
    expect(installPluginFromNpmSpec).toHaveBeenCalledWith(
      expect.objectContaining({ spec: "@enclawed/zalo" }),
    );
  });

  it("uses local path when selected", async () => {
    const runtime = makeRuntime();
    const prompter = makePrompter({
      select: vi.fn(async () => "local") as WizardPrompter["select"],
    });
    const cfg: EnclawedConfig = {};
    mockRepoLocalPathExists();

    const result = await ensureChannelSetupPluginInstalled({
      cfg,
      entry: baseEntry,
      prompter,
      runtime,
    });

    expectPluginLoadedFromLocalPath(result);
    expect(result.cfg.plugins?.entries?.zalo?.enabled).toBe(true);
  });

  it("uses the catalog plugin id for local-path installs", async () => {
    const runtime = makeRuntime();
    const prompter = makePrompter({
      select: vi.fn(async () => "local") as WizardPrompter["select"],
    });
    const cfg: EnclawedConfig = {};
    mockRepoLocalPathExists();

    const result = await ensureChannelSetupPluginInstalled({
      cfg,
      entry: {
        ...baseEntry,
        id: "teams",
        pluginId: "@enclawed/msteams-plugin",
      },
      prompter,
      runtime,
    });

    expect(result.installed).toBe(true);
    expect(result.pluginId).toBe("@enclawed/msteams-plugin");
    expect(result.cfg.plugins?.entries?.["@enclawed/msteams-plugin"]?.enabled).toBe(true);
  });

  it("defaults to local on dev channel when local path exists", async () => {
    expect(await runInitialValueForChannel("dev")).toBe("local");
  });

  it("defaults to npm on beta channel even when local path exists", async () => {
    expect(await runInitialValueForChannel("beta")).toBe("npm");
  });

  it("defaults to bundled local path on beta channel when available", async () => {
    const runtime = makeRuntime();
    const select = vi.fn((async <T extends string>() => "skip" as T) as WizardPrompter["select"]);
    const prompter = makePrompter({ select: select as unknown as WizardPrompter["select"] });
    const cfg: EnclawedConfig = { update: { channel: "beta" } };
    vi.mocked(fs.existsSync).mockReturnValue(false);
    resolveBundledPluginSources.mockReturnValue(
      new Map([
        [
          "zalo",
          {
            pluginId: "zalo",
            localPath: bundledPluginRootAt("/opt/enclawed", "zalo"),
            npmSpec: "@enclawed/zalo",
          },
        ],
      ]),
    );

    await ensureChannelSetupPluginInstalled({
      cfg,
      entry: baseEntry,
      prompter,
      runtime,
    });

    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({
        initialValue: "local",
        options: expect.arrayContaining([
          expect.objectContaining({
            value: "local",
            hint: bundledPluginRootAt("/opt/enclawed", "zalo"),
          }),
        ]),
      }),
    );
  });

  it("does not default to bundled local path when an external catalog overrides the npm spec", async () => {
    const runtime = makeRuntime();
    const select = vi.fn((async <T extends string>() => "skip" as T) as WizardPrompter["select"]);
    const prompter = makePrompter({ select: select as unknown as WizardPrompter["select"] });
    const cfg: EnclawedConfig = { update: { channel: "beta" } };
    vi.mocked(fs.existsSync).mockReturnValue(false);
    resolveBundledPluginSources.mockReturnValue(
      new Map([
        [
          "whatsapp",
          {
            pluginId: "whatsapp",
            localPath: bundledPluginRootAt("/opt/enclawed", "whatsapp"),
            npmSpec: "@enclawed/whatsapp",
          },
        ],
      ]),
    );

    await ensureChannelSetupPluginInstalled({
      cfg,
      entry: {
        id: "whatsapp",
        meta: {
          id: "whatsapp",
          label: "WhatsApp",
          selectionLabel: "WhatsApp",
          docsPath: "/channels/whatsapp",
          blurb: "Test",
        },
        install: {
          npmSpec: "@vendor/whatsapp-fork",
        },
      },
      prompter,
      runtime,
    });

    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({
        initialValue: "npm",
        options: [
          expect.objectContaining({
            value: "npm",
            label: "Download from npm (@vendor/whatsapp-fork)",
          }),
          expect.objectContaining({
            value: "skip",
          }),
        ],
      }),
    );
  });

  it("falls back to local path after npm install failure", async () => {
    const runtime = makeRuntime();
    const note = vi.fn(async () => {});
    const confirm = vi.fn(async () => true);
    const prompter = makePrompter({
      select: vi.fn(async () => "npm") as WizardPrompter["select"],
      note,
      confirm,
    });
    const cfg: EnclawedConfig = {};
    mockRepoLocalPathExists();
    installPluginFromNpmSpec.mockResolvedValue({
      ok: false,
      error: "nope",
    });

    const result = await ensureChannelSetupPluginInstalled({
      cfg,
      entry: baseEntry,
      prompter,
      runtime,
    });

    expectPluginLoadedFromLocalPath(result);
    expect(note).toHaveBeenCalled();
    expect(runtime.error).not.toHaveBeenCalled();
  });

  it("clears discovery cache before reloading the setup plugin registry", () => {
    const runtime = makeRuntime();
    const cfg: EnclawedConfig = {};

    reloadChannelSetupPluginRegistry({
      cfg,
      runtime,
      workspaceDir: "/tmp/enclawed-workspace",
    });

    expect(clearPluginDiscoveryCache).toHaveBeenCalledTimes(1);
    expect(loadEnclawedPlugins).toHaveBeenCalledWith(
      expect.objectContaining({
        config: cfg,
        activationSourceConfig: cfg,
        autoEnabledReasons: {},
        workspaceDir: "/tmp/enclawed-workspace",
        cache: false,
        includeSetupOnlyChannelPlugins: true,
      }),
    );
    expect(clearPluginDiscoveryCache.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(loadEnclawedPlugins).mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it("loads the setup plugin registry from the auto-enabled config snapshot", () => {
    const runtime = makeRuntime();
    const cfg: EnclawedConfig = {
      plugins: {},
      channels: { telegram: { enabled: true } } as never,
    };
    const autoEnabledConfig = {
      ...cfg,
      plugins: {
        entries: {
          telegram: { enabled: true },
        },
      },
    } as EnclawedConfig;
    applyPluginAutoEnable.mockReturnValue({
      config: autoEnabledConfig,
      changes: [],
      autoEnabledReasons: {},
    });

    reloadChannelSetupPluginRegistry({
      cfg,
      runtime,
      workspaceDir: "/tmp/enclawed-workspace",
    });

    expect(applyPluginAutoEnable).toHaveBeenCalledWith({
      config: cfg,
      env: process.env,
    });
    expect(loadEnclawedPlugins).toHaveBeenCalledWith(
      expect.objectContaining({
        config: autoEnabledConfig,
        activationSourceConfig: cfg,
        autoEnabledReasons: {},
      }),
    );
  });

  it("scopes channel reloads when setup starts from an empty registry", () => {
    const runtime = makeRuntime();
    const cfg: EnclawedConfig = {};
    getChannelPluginCatalogEntry.mockReturnValue({ pluginId: "@enclawed/telegram-plugin" });

    reloadChannelSetupPluginRegistryForChannel({
      cfg,
      runtime,
      channel: "telegram",
      workspaceDir: "/tmp/enclawed-workspace",
    });

    expect(loadEnclawedPlugins).toHaveBeenCalledWith(
      expect.objectContaining({
        config: cfg,
        activationSourceConfig: cfg,
        autoEnabledReasons: {},
        workspaceDir: "/tmp/enclawed-workspace",
        cache: false,
        onlyPluginIds: ["@enclawed/telegram-plugin"],
        includeSetupOnlyChannelPlugins: true,
      }),
    );
    expect(getChannelPluginCatalogEntry).toHaveBeenCalledWith("telegram", {
      workspaceDir: "/tmp/enclawed-workspace",
    });
  });

  it("keeps full reloads when the active plugin registry is already populated", () => {
    const runtime = makeRuntime();
    const cfg: EnclawedConfig = {};
    const registry = createEmptyPluginRegistry();
    registry.plugins.push(
      createPluginRecord({
        id: "loaded",
        name: "loaded",
        source: "/tmp/loaded.cjs",
        origin: "bundled",
        configSchema: true,
      }),
    );
    setActivePluginRegistry(registry);

    reloadChannelSetupPluginRegistryForChannel({
      cfg,
      runtime,
      channel: "telegram",
      workspaceDir: "/tmp/enclawed-workspace",
    });

    expect(loadEnclawedPlugins).toHaveBeenCalledWith(
      expect.not.objectContaining({
        onlyPluginIds: expect.anything(),
      }),
    );
  });

  it("scopes channel reloads when the global registry is populated but the pinned channel registry is empty", () => {
    const runtime = makeRuntime();
    const cfg: EnclawedConfig = {};
    getChannelPluginCatalogEntry.mockReturnValue({ pluginId: "@enclawed/telegram-plugin" });
    const activeRegistry = createEmptyPluginRegistry();
    activeRegistry.plugins.push(
      createPluginRecord({
        id: "loaded-tools",
        name: "loaded-tools",
        source: "/tmp/loaded-tools.cjs",
        origin: "bundled",
      }),
    );
    setActivePluginRegistry(activeRegistry);
    const pinnedChannelRegistry = createEmptyPluginRegistry();
    pinActivePluginChannelRegistry(pinnedChannelRegistry);

    try {
      reloadChannelSetupPluginRegistryForChannel({
        cfg,
        runtime,
        channel: "telegram",
        workspaceDir: "/tmp/enclawed-workspace",
      });
    } finally {
      releasePinnedPluginChannelRegistry(pinnedChannelRegistry);
    }

    expect(loadEnclawedPlugins).toHaveBeenCalledWith(
      expect.objectContaining({
        activationSourceConfig: cfg,
        autoEnabledReasons: {},
        onlyPluginIds: ["@enclawed/telegram-plugin"],
      }),
    );
  });

  it("can load a channel-scoped snapshot without activating the global registry", () => {
    const runtime = makeRuntime();
    const cfg: EnclawedConfig = {};
    getChannelPluginCatalogEntry.mockReturnValue({ pluginId: "@enclawed/telegram-plugin" });

    loadChannelSetupPluginRegistrySnapshotForChannel({
      cfg,
      runtime,
      channel: "telegram",
      workspaceDir: "/tmp/enclawed-workspace",
    });

    expect(loadEnclawedPlugins).toHaveBeenCalledWith(
      expect.objectContaining({
        config: cfg,
        activationSourceConfig: cfg,
        autoEnabledReasons: {},
        workspaceDir: "/tmp/enclawed-workspace",
        cache: false,
        onlyPluginIds: ["@enclawed/telegram-plugin"],
        includeSetupOnlyChannelPlugins: true,
        activate: false,
      }),
    );
    expect(getChannelPluginCatalogEntry).toHaveBeenCalledWith("telegram", {
      workspaceDir: "/tmp/enclawed-workspace",
    });
  });

  it("falls back to the bundled plugin for untrusted workspace shadows", () => {
    const runtime = makeRuntime();
    const cfg: EnclawedConfig = {};
    getChannelPluginCatalogEntry
      .mockReturnValueOnce({ pluginId: "evil-telegram-shadow", origin: "workspace" })
      .mockReturnValueOnce({ pluginId: "@enclawed/telegram-plugin", origin: "bundled" });

    loadChannelSetupPluginRegistrySnapshotForChannel({
      cfg,
      runtime,
      channel: "telegram",
      workspaceDir: "/tmp/enclawed-workspace",
    });

    expect(loadEnclawedPlugins).toHaveBeenCalledWith(
      expect.objectContaining({
        onlyPluginIds: ["@enclawed/telegram-plugin"],
      }),
    );
    expect(getChannelPluginCatalogEntry).toHaveBeenNthCalledWith(1, "telegram", {
      workspaceDir: "/tmp/enclawed-workspace",
    });
    expect(getChannelPluginCatalogEntry).toHaveBeenNthCalledWith(2, "telegram", {
      workspaceDir: "/tmp/enclawed-workspace",
      excludeWorkspace: true,
    });
  });

  it("keeps trusted workspace overrides scoped during setup reloads", () => {
    const runtime = makeRuntime();
    const cfg: EnclawedConfig = {
      plugins: {
        enabled: true,
        allow: ["trusted-telegram-shadow"],
      },
    };
    getChannelPluginCatalogEntry.mockReturnValue({
      pluginId: "trusted-telegram-shadow",
      origin: "workspace",
    });

    loadChannelSetupPluginRegistrySnapshotForChannel({
      cfg,
      runtime,
      channel: "telegram",
      workspaceDir: "/tmp/enclawed-workspace",
    });

    expect(loadEnclawedPlugins).toHaveBeenCalledWith(
      expect.objectContaining({
        onlyPluginIds: ["trusted-telegram-shadow"],
      }),
    );
    expect(getChannelPluginCatalogEntry).toHaveBeenCalledTimes(1);
  });

  it("does not scope by raw channel id when no trusted plugin mapping exists", () => {
    const runtime = makeRuntime();
    const cfg: EnclawedConfig = {};

    loadChannelSetupPluginRegistrySnapshotForChannel({
      cfg,
      runtime,
      channel: "telegram",
      workspaceDir: "/tmp/enclawed-workspace",
    });

    expect(loadEnclawedPlugins).toHaveBeenCalledWith(
      expect.not.objectContaining({
        onlyPluginIds: expect.anything(),
      }),
    );
  });

  it("scopes snapshots by a unique discovered manifest match when catalog mapping is missing", () => {
    const runtime = makeRuntime();
    const cfg: EnclawedConfig = {};
    loadPluginManifestRegistry.mockReturnValue({
      plugins: [{ id: "custom-telegram-plugin", channels: ["telegram"] }],
      diagnostics: [],
    });

    loadChannelSetupPluginRegistrySnapshotForChannel({
      cfg,
      runtime,
      channel: "telegram",
      workspaceDir: "/tmp/enclawed-workspace",
    });

    expect(loadEnclawedPlugins).toHaveBeenCalledWith(
      expect.objectContaining({
        config: cfg,
        activationSourceConfig: cfg,
        autoEnabledReasons: {},
        workspaceDir: "/tmp/enclawed-workspace",
        cache: false,
        onlyPluginIds: ["custom-telegram-plugin"],
        includeSetupOnlyChannelPlugins: true,
        activate: false,
      }),
    );
  });

  it("scopes snapshots by activation-declared channel ownership when direct channel lists are empty", () => {
    const runtime = makeRuntime();
    const cfg: EnclawedConfig = {};
    loadPluginManifestRegistry.mockReturnValue({
      plugins: [
        {
          id: "custom-telegram-plugin",
          channels: [],
          activation: {
            onChannels: ["telegram"],
          },
        },
      ],
      diagnostics: [],
    });

    loadChannelSetupPluginRegistrySnapshotForChannel({
      cfg,
      runtime,
      channel: "telegram",
      workspaceDir: "/tmp/enclawed-workspace",
    });

    expect(loadEnclawedPlugins).toHaveBeenCalledWith(
      expect.objectContaining({
        onlyPluginIds: ["custom-telegram-plugin"],
      }),
    );
    expect(loadPluginManifestRegistry).toHaveBeenCalledWith(
      expect.objectContaining({
        cache: false,
      }),
    );
  });

  it("uses uncached manifest discovery for activation-declared setup scoping", () => {
    const runtime = makeRuntime();
    const cfg: EnclawedConfig = {};
    loadPluginManifestRegistry.mockReturnValue({
      plugins: [
        {
          id: "custom-telegram-plugin",
          channels: [],
          activation: {
            onChannels: ["telegram"],
          },
        },
      ],
      diagnostics: [],
    });

    loadChannelSetupPluginRegistrySnapshotForChannel({
      cfg,
      runtime,
      channel: "telegram",
      workspaceDir: "/tmp/enclawed-workspace",
    });

    expect(loadPluginManifestRegistry).toHaveBeenCalled();
    expect(
      loadPluginManifestRegistry.mock.calls.every(
        ([params]) => (params as { cache?: boolean }).cache === false,
      ),
    ).toBe(true);
  });

  it("does not trust unconfigured workspace activation-only channel ownership during setup", () => {
    const runtime = makeRuntime();
    const cfg: EnclawedConfig = {};
    loadPluginManifestRegistry.mockReturnValue({
      plugins: [
        {
          id: "evil-telegram-shadow",
          channels: [],
          origin: "workspace",
          activation: {
            onChannels: ["telegram"],
          },
        },
      ],
      diagnostics: [],
    });

    loadChannelSetupPluginRegistrySnapshotForChannel({
      cfg,
      runtime,
      channel: "telegram",
      workspaceDir: "/tmp/enclawed-workspace",
    });

    expect(loadEnclawedPlugins).toHaveBeenCalledWith(
      expect.not.objectContaining({
        onlyPluginIds: ["evil-telegram-shadow"],
      }),
    );
    expect(
      (vi.mocked(loadEnclawedPlugins).mock.calls[0]?.[0] as { onlyPluginIds?: string[] })
        .onlyPluginIds,
    ).toBeUndefined();
  });

  it("does not trust allowlist-excluded bundled activation-only channel ownership during setup", () => {
    const runtime = makeRuntime();
    const cfg: EnclawedConfig = {
      plugins: {
        allow: ["other-plugin"],
      },
    };
    loadPluginManifestRegistry.mockReturnValue({
      plugins: [
        {
          id: "custom-telegram-plugin",
          channels: [],
          origin: "bundled",
          activation: {
            onChannels: ["telegram"],
          },
        },
      ],
      diagnostics: [],
    });

    loadChannelSetupPluginRegistrySnapshotForChannel({
      cfg,
      runtime,
      channel: "telegram",
      workspaceDir: "/tmp/enclawed-workspace",
    });

    expect(loadEnclawedPlugins).toHaveBeenCalledWith(
      expect.not.objectContaining({
        onlyPluginIds: ["custom-telegram-plugin"],
      }),
    );
    expect(
      (vi.mocked(loadEnclawedPlugins).mock.calls[0]?.[0] as { onlyPluginIds?: string[] })
        .onlyPluginIds,
    ).toBeUndefined();
  });

  it("does not trust explicitly denied bundled activation-only channel ownership during setup", () => {
    const runtime = makeRuntime();
    const cfg: EnclawedConfig = {
      plugins: {
        deny: ["custom-telegram-plugin"],
      },
    };
    loadPluginManifestRegistry.mockReturnValue({
      plugins: [
        {
          id: "custom-telegram-plugin",
          channels: [],
          origin: "bundled",
          activation: {
            onChannels: ["telegram"],
          },
        },
      ],
      diagnostics: [],
    });

    loadChannelSetupPluginRegistrySnapshotForChannel({
      cfg,
      runtime,
      channel: "telegram",
      workspaceDir: "/tmp/enclawed-workspace",
    });

    expect(loadEnclawedPlugins).toHaveBeenCalledWith(
      expect.not.objectContaining({
        onlyPluginIds: ["custom-telegram-plugin"],
      }),
    );
    expect(
      (vi.mocked(loadEnclawedPlugins).mock.calls[0]?.[0] as { onlyPluginIds?: string[] })
        .onlyPluginIds,
    ).toBeUndefined();
  });

  it("does not trust explicitly disabled workspace activation-only channel ownership during setup", () => {
    const runtime = makeRuntime();
    const cfg: EnclawedConfig = {
      plugins: {
        enabled: true,
        allow: ["evil-telegram-shadow"],
        entries: {
          "evil-telegram-shadow": { enabled: false },
        },
      },
    };
    loadPluginManifestRegistry.mockReturnValue({
      plugins: [
        {
          id: "evil-telegram-shadow",
          channels: [],
          origin: "workspace",
          activation: {
            onChannels: ["telegram"],
          },
        },
      ],
      diagnostics: [],
    });

    loadChannelSetupPluginRegistrySnapshotForChannel({
      cfg,
      runtime,
      channel: "telegram",
      workspaceDir: "/tmp/enclawed-workspace",
    });

    expect(loadEnclawedPlugins).toHaveBeenCalledWith(
      expect.not.objectContaining({
        onlyPluginIds: ["evil-telegram-shadow"],
      }),
    );
    expect(
      (vi.mocked(loadEnclawedPlugins).mock.calls[0]?.[0] as { onlyPluginIds?: string[] })
        .onlyPluginIds,
    ).toBeUndefined();
  });

  it("does not trust explicitly disabled bundled activation-only channel ownership during setup", () => {
    const runtime = makeRuntime();
    const cfg: EnclawedConfig = {
      plugins: {
        entries: {
          "custom-telegram-plugin": { enabled: false },
        },
      },
    };
    loadPluginManifestRegistry.mockReturnValue({
      plugins: [
        {
          id: "custom-telegram-plugin",
          channels: [],
          origin: "bundled",
          activation: {
            onChannels: ["telegram"],
          },
        },
      ],
      diagnostics: [],
    });

    loadChannelSetupPluginRegistrySnapshotForChannel({
      cfg,
      runtime,
      channel: "telegram",
      workspaceDir: "/tmp/enclawed-workspace",
    });

    expect(loadEnclawedPlugins).toHaveBeenCalledWith(
      expect.not.objectContaining({
        onlyPluginIds: ["custom-telegram-plugin"],
      }),
    );
    expect(
      (vi.mocked(loadEnclawedPlugins).mock.calls[0]?.[0] as { onlyPluginIds?: string[] })
        .onlyPluginIds,
    ).toBeUndefined();
  });

  it("does not trust unenabled global activation-only channel ownership during setup", () => {
    const runtime = makeRuntime();
    const cfg: EnclawedConfig = {};
    loadPluginManifestRegistry.mockReturnValue({
      plugins: [
        {
          id: "custom-telegram-global",
          channels: [],
          origin: "global",
          activation: {
            onChannels: ["telegram"],
          },
        },
      ],
      diagnostics: [],
    });

    loadChannelSetupPluginRegistrySnapshotForChannel({
      cfg,
      runtime,
      channel: "telegram",
      workspaceDir: "/tmp/enclawed-workspace",
    });

    expect(loadEnclawedPlugins).toHaveBeenCalledWith(
      expect.not.objectContaining({
        onlyPluginIds: ["custom-telegram-global"],
      }),
    );
    expect(
      (vi.mocked(loadEnclawedPlugins).mock.calls[0]?.[0] as { onlyPluginIds?: string[] })
        .onlyPluginIds,
    ).toBeUndefined();
  });

  it("scopes snapshots by plugin id when channel and plugin ids differ", () => {
    const runtime = makeRuntime();
    const cfg: EnclawedConfig = {};

    loadChannelSetupPluginRegistrySnapshotForChannel({
      cfg,
      runtime,
      channel: "msteams",
      pluginId: "@enclawed/msteams-plugin",
      workspaceDir: "/tmp/enclawed-workspace",
    });

    expect(loadEnclawedPlugins).toHaveBeenCalledWith(
      expect.objectContaining({
        config: cfg,
        activationSourceConfig: cfg,
        autoEnabledReasons: {},
        workspaceDir: "/tmp/enclawed-workspace",
        cache: false,
        onlyPluginIds: ["@enclawed/msteams-plugin"],
        includeSetupOnlyChannelPlugins: true,
        activate: false,
      }),
    );
  });
});
