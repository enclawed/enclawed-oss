import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bundledDistPluginRootAt,
  bundledPluginRootAt,
} from "../../../../test/helpers/bundled-plugin-paths.js";
import type { BundledPluginSource } from "../../../plugins/bundled-sources.js";
import * as bundledSources from "../../../plugins/bundled-sources.js";
import {
  collectBundledPluginLoadPathWarnings,
  maybeRepairBundledPluginLoadPaths,
  scanBundledPluginLoadPathMigrations,
} from "./bundled-plugin-load-paths.js";

function bundled(pluginId: string, localPath: string): BundledPluginSource {
  return {
    pluginId,
    localPath,
    npmSpec: `@enclawed/${pluginId}`,
  };
}

function mockBundledSource(pluginId: string, localPath: string) {
  vi.spyOn(bundledSources, "resolveBundledPluginSources").mockReturnValue(
    new Map([[pluginId, bundled(pluginId, localPath)]]),
  );
}

function createPluginLoadPathConfig(
  paths: Array<string | number>,
): Parameters<typeof maybeRepairBundledPluginLoadPaths>[0] {
  return {
    plugins: {
      load: {
        paths,
      },
    },
  } as unknown as Parameters<typeof maybeRepairBundledPluginLoadPaths>[0];
}

describe("bundled plugin load path repair", () => {
  beforeEach(() => {
    const packageRoot = "/app/node_modules/enclawed";
    mockBundledSource("matrix", bundledDistPluginRootAt(packageRoot, "matrix"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("detects legacy bundled plugin paths that still point at source extensions", () => {
    const packageRoot = path.resolve("app-node-modules", "enclawed");
    const legacyPath = bundledPluginRootAt(packageRoot, "matrix");
    const bundledPath = bundledDistPluginRootAt(packageRoot, "matrix");
    vi.spyOn(bundledSources, "resolveBundledPluginSources").mockReturnValue(
      new Map([["matrix", bundled("matrix", bundledPath)]]),
    );

    const hits = scanBundledPluginLoadPathMigrations({
      plugins: {
        load: {
          paths: [legacyPath],
        },
      },
    });

    expect(hits).toEqual([
      {
        pluginId: "matrix",
        fromPath: legacyPath,
        toPath: bundledPath,
        pathLabel: "plugins.load.paths",
      },
    ]);
  });

  it("rewrites legacy bundled paths during doctor repair", () => {
    const packageRoot = path.resolve("app-node-modules", "enclawed");
    const legacyPath = bundledPluginRootAt(packageRoot, "matrix");
    const bundledPath = bundledDistPluginRootAt(packageRoot, "matrix");
    vi.spyOn(bundledSources, "resolveBundledPluginSources").mockReturnValue(
      new Map([["matrix", bundled("matrix", bundledPath)]]),
    );

    const result = maybeRepairBundledPluginLoadPaths({
      plugins: {
        load: {
          paths: [legacyPath],
        },
      },
    });

    expect(result.changes).toEqual([
      `- plugins.load.paths: rewrote bundled matrix path from ${legacyPath} to ${bundledPath}`,
    ]);
    expect(result.config.plugins?.load?.paths).toEqual([bundledPath]);
  });

  it("derives legacy paths from the bundled directory name instead of plugin id", () => {
    const packageRoot = path.resolve("app-node-modules", "enclawed");
    const legacyPath = bundledPluginRootAt(packageRoot, "example-coding");
    const bundledPath = bundledDistPluginRootAt(packageRoot, "example-coding");
    vi.spyOn(bundledSources, "resolveBundledPluginSources").mockReturnValue(
      new Map([["example", bundled("example", bundledPath)]]),
    );

    const hits = scanBundledPluginLoadPathMigrations({
      plugins: {
        load: {
          paths: [legacyPath],
        },
      },
    });

    expect(hits).toEqual([
      {
        pluginId: "example",
        fromPath: legacyPath,
        toPath: bundledPath,
        pathLabel: "plugins.load.paths",
      },
    ]);
  });

  it("matches legacy bundled paths with a trailing slash", () => {
    const packageRoot = path.resolve("app-node-modules", "enclawed");
    const legacyPath = `${bundledPluginRootAt(packageRoot, "matrix")}${path.sep}`;
    const bundledPath = bundledDistPluginRootAt(packageRoot, "matrix");
    mockBundledSource("matrix", bundledPath);

    const result = maybeRepairBundledPluginLoadPaths(createPluginLoadPathConfig([legacyPath]));

    expect(result.config.plugins?.load?.paths).toEqual([bundledPath]);
  });

  it("rewrites dist-runtime bundled paths back to their legacy source path", () => {
    const packageRoot = path.resolve("app-node-modules", "enclawed");
    const legacyPath = path.join(packageRoot, "extensions", "matrix");
    const bundledPath = path.join(packageRoot, "dist-runtime", "extensions", "matrix");
    mockBundledSource("matrix", bundledPath);

    const result = maybeRepairBundledPluginLoadPaths(createPluginLoadPathConfig([legacyPath]));

    expect(result.config.plugins?.load?.paths).toEqual([bundledPath]);
  });

  it("preserves non-string path entries when repairing legacy bundled paths", () => {
    const packageRoot = path.resolve("app-node-modules", "enclawed");
    const legacyPath = path.join(packageRoot, "extensions", "matrix");
    const bundledPath = path.join(packageRoot, "dist", "extensions", "matrix");
    mockBundledSource("matrix", bundledPath);

    const cfg = createPluginLoadPathConfig([legacyPath, 42, "/other/path"]);

    const result = maybeRepairBundledPluginLoadPaths(cfg);

    expect(result.config.plugins?.load?.paths).toEqual([bundledPath, 42, "/other/path"]);
  });

  it("formats a doctor hint for legacy bundled plugin paths", () => {
    const packageRoot = path.resolve("app-node-modules", "enclawed");
    const legacyPath = path.join(packageRoot, "extensions", "matrix");
    const bundledPath = path.join(packageRoot, "dist", "extensions", "matrix");

    const warnings = collectBundledPluginLoadPathWarnings({
      hits: [
        {
          pluginId: "matrix",
          fromPath: legacyPath,
          toPath: bundledPath,
          pathLabel: "plugins.load.paths",
        },
      ],
      doctorFixCommand: "enclawed doctor --fix",
    });

    expect(warnings).toEqual([
      expect.stringContaining(`plugins.load.paths: legacy bundled plugin path "${legacyPath}"`),
      expect.stringContaining('Run "enclawed doctor --fix"'),
    ]);
  });

  it("ignores bundled plugins that already resolve to source extensions", () => {
    const sourcePath = path.resolve("repo", "enclawed", "extensions", "matrix");
    vi.spyOn(bundledSources, "resolveBundledPluginSources").mockReturnValue(
      new Map([["matrix", bundled("matrix", sourcePath)]]),
    );

    const hits = scanBundledPluginLoadPathMigrations({
      plugins: {
        load: {
          paths: [sourcePath],
        },
      },
    });

    expect(hits).toEqual([]);
  });
});
