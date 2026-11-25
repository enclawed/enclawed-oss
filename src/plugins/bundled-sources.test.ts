import { beforeEach, describe, expect, it, vi } from "vitest";
import { bundledPluginRootAt } from "../../test/helpers/bundled-plugin-paths.js";
import {
  findBundledPluginSource,
  findBundledPluginSourceInMap,
  resolveBundledPluginSources,
} from "./bundled-sources.js";

const APP_ROOT = "/app";

function appBundledPluginRoot(pluginId: string): string {
  return bundledPluginRootAt(APP_ROOT, pluginId);
}

const discoverEnclawedPluginsMock = vi.fn();
const loadPluginManifestMock = vi.fn();

vi.mock("./discovery.js", () => ({
  discoverEnclawedPlugins: (...args: unknown[]) => discoverEnclawedPluginsMock(...args),
}));

vi.mock("./manifest.js", () => ({
  loadPluginManifest: (...args: unknown[]) => loadPluginManifestMock(...args),
}));

function createBundledCandidate(params: {
  rootDir: string;
  packageName: string;
  npmSpec?: string;
  origin?: "bundled" | "global";
}) {
  return {
    origin: params.origin ?? "bundled",
    rootDir: params.rootDir,
    packageName: params.packageName,
    packageManifest: {
      install: {
        npmSpec: params.npmSpec ?? params.packageName,
      },
    },
  };
}

function setBundledDiscoveryCandidates(candidates: unknown[]) {
  discoverEnclawedPluginsMock.mockReturnValue({
    candidates,
    diagnostics: [],
  });
}

function setBundledManifestIdsByRoot(manifestIds: Record<string, string>) {
  loadPluginManifestMock.mockImplementation((rootDir: string) =>
    rootDir in manifestIds
      ? { ok: true, manifest: { id: manifestIds[rootDir] } }
      : {
          ok: false,
          error: "invalid manifest",
          manifestPath: `${rootDir}/enclawed.plugin.json`,
        },
  );
}

function setBundledLookupFixture() {
  setBundledDiscoveryCandidates([
    createBundledCandidate({
      rootDir: appBundledPluginRoot("matrix"),
      packageName: "@enclawed/matrix",
    }),
    createBundledCandidate({
      rootDir: appBundledPluginRoot("diffs"),
      packageName: "@enclawed/diffs",
    }),
  ]);
  setBundledManifestIdsByRoot({
    [appBundledPluginRoot("matrix")]: "matrix",
    [appBundledPluginRoot("diffs")]: "diffs",
  });
}

function createResolvedBundledSource(params: {
  pluginId: string;
  localPath: string;
  npmSpec?: string;
}) {
  return {
    pluginId: params.pluginId,
    localPath: params.localPath,
    npmSpec: params.npmSpec ?? `@enclawed/${params.pluginId}`,
  };
}

function expectBundledSourceLookup(
  lookup: Parameters<typeof findBundledPluginSource>[0]["lookup"],
  expected:
    | {
        pluginId: string;
        localPath: string;
      }
    | undefined,
) {
  const resolved = findBundledPluginSource({ lookup });
  if (!expected) {
    expect(resolved).toBeUndefined();
    return;
  }
  expect(resolved?.pluginId).toBe(expected.pluginId);
  expect(resolved?.localPath).toBe(expected.localPath);
}

function expectBundledSourceLookupCase(params: {
  lookup: Parameters<typeof findBundledPluginSource>[0]["lookup"];
  expected:
    | {
        pluginId: string;
        localPath: string;
      }
    | undefined;
}) {
  setBundledLookupFixture();
  expectBundledSourceLookup(params.lookup, params.expected);
}

describe("bundled plugin sources", () => {
  beforeEach(() => {
    discoverEnclawedPluginsMock.mockReset();
    loadPluginManifestMock.mockReset();
  });

  it("resolves bundled sources keyed by plugin id", () => {
    setBundledDiscoveryCandidates([
      createBundledCandidate({
        origin: "global",
        rootDir: "/global/matrix",
        packageName: "@enclawed/matrix",
      }),
      createBundledCandidate({
        rootDir: appBundledPluginRoot("matrix"),
        packageName: "@enclawed/matrix",
      }),
      createBundledCandidate({
        rootDir: appBundledPluginRoot("matrix-dup"),
        packageName: "@enclawed/matrix",
      }),
      createBundledCandidate({
        rootDir: appBundledPluginRoot("msteams"),
        packageName: "@enclawed/msteams",
      }),
    ]);
    setBundledManifestIdsByRoot({
      [appBundledPluginRoot("matrix")]: "matrix",
      [appBundledPluginRoot("msteams")]: "msteams",
    });

    const map = resolveBundledPluginSources({});

    expect(Array.from(map.keys())).toEqual(["matrix", "msteams"]);
    expect(map.get("matrix")).toEqual(
      createResolvedBundledSource({
        pluginId: "matrix",
        localPath: appBundledPluginRoot("matrix"),
      }),
    );
  });

  it.each([
    [
      "finds bundled source by npm spec",
      { kind: "npmSpec", value: "@enclawed/matrix" } as const,
      { pluginId: "matrix", localPath: appBundledPluginRoot("matrix") },
    ],
    [
      "returns undefined for missing npm spec",
      { kind: "npmSpec", value: "@enclawed/not-found" } as const,
      undefined,
    ],
    [
      "finds bundled source by plugin id",
      { kind: "pluginId", value: "diffs" } as const,
      { pluginId: "diffs", localPath: appBundledPluginRoot("diffs") },
    ],
    [
      "returns undefined for missing plugin id",
      { kind: "pluginId", value: "not-found" } as const,
      undefined,
    ],
  ] as const)("%s", (_name, lookup, expected) => {
    expectBundledSourceLookupCase({ lookup, expected });
  });

  it("forwards an explicit env to bundled discovery helpers", () => {
    setBundledDiscoveryCandidates([]);

    const env = { HOME: "/tmp/enclawed-home" } as NodeJS.ProcessEnv;

    resolveBundledPluginSources({
      workspaceDir: "/workspace",
      env,
    });
    findBundledPluginSource({
      lookup: { kind: "pluginId", value: "matrix" },
      workspaceDir: "/workspace",
      env,
    });

    expect(discoverEnclawedPluginsMock).toHaveBeenNthCalledWith(1, {
      workspaceDir: "/workspace",
      env,
    });
    expect(discoverEnclawedPluginsMock).toHaveBeenNthCalledWith(2, {
      workspaceDir: "/workspace",
      env,
    });
  });

  it("reuses a pre-resolved bundled map for repeated lookups", () => {
    const bundled = new Map([
      [
        "matrix",
        createResolvedBundledSource({
          pluginId: "matrix",
          localPath: appBundledPluginRoot("matrix"),
        }),
      ],
    ]);

    expect(
      findBundledPluginSourceInMap({
        bundled,
        lookup: { kind: "pluginId", value: "matrix" },
      }),
    ).toEqual(
      createResolvedBundledSource({
        pluginId: "matrix",
        localPath: appBundledPluginRoot("matrix"),
      }),
    );
    expect(
      findBundledPluginSourceInMap({
        bundled,
        lookup: { kind: "npmSpec", value: "@enclawed/matrix" },
      })?.pluginId,
    ).toBe("matrix");
  });
});
