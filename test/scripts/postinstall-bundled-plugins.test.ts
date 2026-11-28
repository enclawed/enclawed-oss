import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  BundledPluginDepsMissingError,
  createNestedNpmInstallEnv,
  pruneInstalledPackageDist,
  discoverBundledPluginRuntimeDeps,
  pruneBundledPluginSourceNodeModules,
  restoreLegacyUpdaterCompatSidecars,
  runBundledPluginPostinstall,
} from "../../scripts/postinstall-bundled-plugins.mjs";
import { writePackageDistInventory } from "../../src/infra/package-dist-inventory.ts";
import { createScriptTestHarness } from "./test-helpers.js";

const { createTempDirAsync } = createScriptTestHarness();

async function createExtensionsDir() {
  const root = await createTempDirAsync("enclawed-postinstall-");
  const extensionsDir = path.join(root, "dist", "extensions");
  await fs.mkdir(extensionsDir, { recursive: true });
  return extensionsDir;
}

async function writePluginPackage(
  extensionsDir: string,
  pluginId: string,
  packageJson: Record<string, unknown>,
) {
  const pluginDir = path.join(extensionsDir, pluginId);
  await fs.mkdir(pluginDir, { recursive: true });
  await fs.writeFile(
    path.join(pluginDir, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
  const packageRoot =
    path.basename(path.dirname(extensionsDir)) === "dist"
      ? path.dirname(path.dirname(extensionsDir))
      : path.dirname(extensionsDir);
  try {
    await writePackageDistInventory(packageRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

describe("bundled plugin postinstall", () => {
  // The postinstall never fetches: a missing bundled plugin runtime dep fails
  // the install (BundledPluginDepsMissingError) and npm is never spawned.
  function expectRefusedWithoutSpawn(
    run: () => void,
    spawnSync: ReturnType<typeof vi.fn>,
    missingSpecs: string[],
  ) {
    let thrown: unknown;
    try {
      run();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(BundledPluginDepsMissingError);
    expect((thrown as { missingSpecs: string[] }).missingSpecs).toEqual(missingSpecs);
    expect((thrown as Error).message).toContain("does not download packages during install");
    expect(spawnSync).not.toHaveBeenCalled();
  }

  it("clears global npm config before nested installs", () => {
    expect(
      createNestedNpmInstallEnv({
        npm_config_global: "true",
        npm_config_location: "global",
        npm_config_prefix: "/opt/homebrew",
        HOME: "/tmp/home",
      }),
    ).toEqual({
      HOME: "/tmp/home",
    });
  });

  it("refuses (does not fetch) missing bundled plugin deps outside of source checkouts", async () => {
    const extensionsDir = await createExtensionsDir();
    const packageRoot = path.dirname(path.dirname(extensionsDir));
    await writePluginPackage(extensionsDir, "acpx", {
      dependencies: {
        acpx: "0.4.1",
      },
    });
    const spawnSync = vi.fn();

    expectRefusedWithoutSpawn(
      () =>
        runBundledPluginPostinstall({
          env: { HOME: "/tmp/home" },
          extensionsDir,
          packageRoot,
          spawnSync,
          log: { log: vi.fn(), warn: vi.fn() },
        }),
      spawnSync,
      ["acpx@0.4.1"],
    );
  });

  it("fails the install from the CLI entry point without contacting the registry", async () => {
    const extensionsDir = await createExtensionsDir();
    const packageRoot = path.dirname(path.dirname(extensionsDir));
    await writePluginPackage(extensionsDir, "acpx", { dependencies: { acpx: "0.4.1" } });
    await fs.mkdir(path.join(packageRoot, "scripts"), { recursive: true });
    for (const file of ["postinstall-bundled-plugins.mjs"]) {
      await fs.copyFile(
        path.join(process.cwd(), "scripts", file),
        path.join(packageRoot, "scripts", file),
      );
    }
    const { spawnSync: realSpawnSync } = await import("node:child_process");
    // A registry that cannot be reached: a fetch attempt would hang or fail
    // differently; the script must exit 1 with the refusal before any fetch.
    const result = realSpawnSync(
      process.execPath,
      [path.join(packageRoot, "scripts", "postinstall-bundled-plugins.mjs")],
      {
        cwd: packageRoot,
        encoding: "utf8",
        env: {
          PATH: "/nonexistent",
          HOME: packageRoot,
          npm_config_registry: "http://127.0.0.1:9/",
        },
        timeout: 30_000,
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("bundled plugin runtime dependencies are missing: acpx@0.4.1");
  });

  it("prunes source-checkout bundled plugin node_modules", async () => {
    const packageRoot = await createTempDirAsync("enclawed-source-checkout-");
    const extensionsDir = path.join(packageRoot, "extensions");
    await fs.mkdir(path.join(packageRoot, ".git"), { recursive: true });
    await fs.mkdir(path.join(packageRoot, "src"), { recursive: true });
    await fs.mkdir(extensionsDir, { recursive: true });
    await writePluginPackage(extensionsDir, "acpx", {
      dependencies: {
        acpx: "0.5.2",
      },
    });
    await fs.mkdir(path.join(extensionsDir, "acpx", "node_modules", "acpx"), { recursive: true });
    await fs.writeFile(
      path.join(extensionsDir, "acpx", "node_modules", "acpx", "package.json"),
      JSON.stringify({ name: "acpx", version: "0.4.1" }),
    );
    const spawnSync = vi.fn();

    runBundledPluginPostinstall({
      env: { HOME: "/tmp/home" },
      packageRoot,
      spawnSync,
      log: { log: vi.fn(), warn: vi.fn() },
    });

    await expect(fs.stat(path.join(extensionsDir, "acpx", "node_modules"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it("keeps source-checkout prune non-fatal", async () => {
    const packageRoot = await createTempDirAsync("enclawed-source-checkout-prune-error-");
    const extensionsDir = path.join(packageRoot, "extensions");
    await fs.mkdir(path.join(packageRoot, ".git"), { recursive: true });
    await fs.mkdir(path.join(packageRoot, "src"), { recursive: true });
    await fs.mkdir(path.join(extensionsDir, "acpx"), { recursive: true });
    await fs.writeFile(path.join(extensionsDir, "acpx", "package.json"), "{}\n");
    const warn = vi.fn();

    expect(() =>
      runBundledPluginPostinstall({
        env: { HOME: "/tmp/home" },
        packageRoot,
        rmSync: vi.fn(() => {
          throw new Error("locked");
        }),
        log: { log: vi.fn(), warn },
      }),
    ).not.toThrow();

    expect(warn).toHaveBeenCalledWith(
      "[postinstall] could not prune bundled plugin source node_modules: Error: locked",
    );
  });

  it("honors disable env before source-checkout pruning", async () => {
    const packageRoot = await createTempDirAsync("enclawed-source-checkout-disabled-");
    const extensionsDir = path.join(packageRoot, "extensions");
    await fs.mkdir(path.join(packageRoot, ".git"), { recursive: true });
    await fs.mkdir(path.join(packageRoot, "src"), { recursive: true });
    await fs.mkdir(path.join(extensionsDir, "acpx", "node_modules"), { recursive: true });
    await fs.writeFile(path.join(extensionsDir, "acpx", "package.json"), "{}\n");

    runBundledPluginPostinstall({
      env: { ENCLAWED_DISABLE_BUNDLED_PLUGIN_POSTINSTALL: "1" },
      packageRoot,
      log: { log: vi.fn(), warn: vi.fn() },
    });

    await expect(fs.stat(path.join(extensionsDir, "acpx", "node_modules"))).resolves.toBeTruthy();
  });

  it("prunes stale dist files from packaged installs", async () => {
    const packageRoot = await createTempDirAsync("enclawed-packaged-install-");
    const currentFile = path.join(packageRoot, "dist", "channel-BOa4MfoC.js");
    const staleFile = path.join(packageRoot, "dist", "channel-CJUAgRQR.js");
    await fs.mkdir(path.dirname(currentFile), { recursive: true });
    await fs.writeFile(currentFile, "export {};\n");
    await writePackageDistInventory(packageRoot);
    await fs.writeFile(staleFile, "export {};\n");

    expect(
      pruneInstalledPackageDist({
        packageRoot,
        log: { log: vi.fn(), warn: vi.fn() },
      }),
    ).toEqual(["dist/channel-CJUAgRQR.js"]);

    await expect(fs.stat(currentFile)).resolves.toBeTruthy();
    await expect(fs.stat(staleFile)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("restores only postinstall-generated QA compat sidecars after pruning old installs", async () => {
    const packageRoot = await createTempDirAsync("enclawed-packaged-install-qa-compat-");
    const currentFile = path.join(packageRoot, "dist", "entry.js");
    const stalePackage = path.join(packageRoot, "dist", "extensions", "qa-lab", "package.json");
    const staleManifest = path.join(
      packageRoot,
      "dist",
      "extensions",
      "qa-lab",
      "enclawed.plugin.json",
    );
    await fs.mkdir(path.dirname(stalePackage), { recursive: true });
    await fs.writeFile(currentFile, "export {};\n");
    await writePackageDistInventory(packageRoot);
    await fs.writeFile(stalePackage, "{}\n");
    await fs.writeFile(staleManifest, "{}\n");

    runBundledPluginPostinstall({
      packageRoot,
      spawnSync: vi.fn(),
      log: { log: vi.fn(), warn: vi.fn() },
    });

    await expect(fs.stat(stalePackage)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(staleManifest)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fs.readFile(
        path.join(packageRoot, "dist", "extensions", "qa-channel", "runtime-api.js"),
        "utf8",
      ),
    ).resolves.toContain("QA channel implementation is not packaged");
    await expect(
      fs.readFile(path.join(packageRoot, "dist", "extensions", "qa-lab", "runtime-api.js"), "utf8"),
    ).resolves.toContain("QA lab implementation is not packaged");
  });

  it("creates only empty QA compat sidecars for fresh installs", async () => {
    const packageRoot = await createTempDirAsync("enclawed-packaged-install-no-qa-compat-");
    await fs.mkdir(path.join(packageRoot, "dist"), { recursive: true });
    await fs.writeFile(path.join(packageRoot, "dist", "entry.js"), "export {};\n");
    await writePackageDistInventory(packageRoot);

    expect(
      restoreLegacyUpdaterCompatSidecars({
        packageRoot,
        removedFiles: ["dist/entry-old.js"],
        log: { log: vi.fn(), warn: vi.fn() },
      }),
    ).toEqual([
      "dist/extensions/qa-channel/runtime-api.js",
      "dist/extensions/qa-lab/runtime-api.js",
    ]);

    await expect(
      fs.readFile(
        path.join(packageRoot, "dist", "extensions", "qa-channel", "runtime-api.js"),
        "utf8",
      ),
    ).resolves.toBe(
      "// Compatibility stub for older Enclawed updaters. The QA channel implementation is not packaged.\nexport {};\n",
    );
    await expect(
      fs.readFile(path.join(packageRoot, "dist", "extensions", "qa-lab", "runtime-api.js"), "utf8"),
    ).resolves.toBe(
      "// Compatibility stub for older Enclawed updaters. The QA lab implementation is not packaged.\nexport {};\n",
    );
    await expect(
      fs.stat(path.join(packageRoot, "dist", "extensions", "qa-channel", "package.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fs.stat(path.join(packageRoot, "dist", "extensions", "qa-channel", "enclawed.plugin.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fs.stat(path.join(packageRoot, "dist", "extensions", "qa-lab", "package.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fs.stat(path.join(packageRoot, "dist", "extensions", "qa-lab", "enclawed.plugin.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps packaged postinstall non-fatal when the dist inventory is missing", async () => {
    const packageRoot = await createTempDirAsync("enclawed-packaged-install-missing-inventory-");
    const staleFile = path.join(packageRoot, "dist", "channel-CJUAgRQR.js");
    await fs.mkdir(path.dirname(staleFile), { recursive: true });
    await fs.writeFile(staleFile, "export {};\n");
    const warn = vi.fn();

    expect(() =>
      runBundledPluginPostinstall({
        packageRoot,
        log: { log: vi.fn(), warn },
      }),
    ).not.toThrow();

    await expect(fs.stat(staleFile)).resolves.toBeTruthy();
    expect(warn).toHaveBeenCalledWith(
      "[postinstall] skipping dist prune: missing dist inventory: dist/postinstall-inventory.json",
    );
  });

  it("keeps packaged postinstall non-fatal when the dist inventory is invalid", async () => {
    const packageRoot = await createTempDirAsync("enclawed-packaged-install-invalid-inventory-");
    const currentFile = path.join(packageRoot, "dist", "channel-BOa4MfoC.js");
    const inventoryPath = path.join(packageRoot, "dist", "postinstall-inventory.json");
    await fs.mkdir(path.dirname(currentFile), { recursive: true });
    await fs.writeFile(currentFile, "export {};\n");
    await fs.writeFile(inventoryPath, "{not-json}\n");
    const warn = vi.fn();

    expect(() =>
      runBundledPluginPostinstall({
        packageRoot,
        log: { log: vi.fn(), warn },
      }),
    ).not.toThrow();

    await expect(fs.stat(currentFile)).resolves.toBeTruthy();
    expect(warn).toHaveBeenCalledWith(
      "[postinstall] skipping dist prune: invalid dist inventory: dist/postinstall-inventory.json",
    );
  });

  it("rejects symlinked dist roots in packaged installs", () => {
    expect(() =>
      pruneInstalledPackageDist({
        packageRoot: "/pkg",
        expectedFiles: new Set(),
        existsSync: vi.fn(() => true),
        lstatSync: vi.fn((filePath) => ({
          isDirectory: () => filePath === "/pkg/dist",
          isSymbolicLink: () => filePath === "/pkg/dist",
        })),
        realpathSync: vi.fn((filePath) => filePath),
        readdirSync: vi.fn(),
        rmSync: vi.fn(),
        log: { log: vi.fn(), warn: vi.fn() },
      }),
    ).toThrow("unsafe dist root: dist must be a real directory");
  });

  it("rejects symlink entries in packaged dist trees", () => {
    expect(() =>
      pruneInstalledPackageDist({
        packageRoot: "/pkg",
        expectedFiles: new Set(),
        existsSync: vi.fn(() => true),
        lstatSync: vi.fn(() => ({
          isDirectory: () => true,
          isSymbolicLink: () => false,
        })),
        realpathSync: vi.fn((filePath) => filePath),
        readdirSync: vi.fn((filePath) => {
          if (filePath === "/pkg/dist") {
            return [
              {
                name: "escape",
                isDirectory: () => false,
                isFile: () => false,
                isSymbolicLink: () => true,
              },
            ];
          }
          return [];
        }),
        rmSync: vi.fn(),
        log: { log: vi.fn(), warn: vi.fn() },
      }),
    ).toThrow("unsafe dist entry: dist/escape");
  });

  it("unlinks stale files instead of recursive pruning them", () => {
    const unlinkSync = vi.fn();

    expect(
      pruneInstalledPackageDist({
        packageRoot: "/pkg",
        expectedFiles: new Set(),
        existsSync: vi.fn(() => true),
        lstatSync: vi.fn(() => ({
          isDirectory: () => true,
          isSymbolicLink: () => false,
        })),
        realpathSync: vi.fn((filePath) => filePath),
        readdirSync: vi.fn((filePath, options) => {
          if (filePath === "/pkg/dist" && options?.withFileTypes) {
            return [
              {
                name: "stale.js",
                isDirectory: () => false,
                isFile: () => true,
                isSymbolicLink: () => false,
              },
            ];
          }
          return [];
        }),
        unlinkSync,
        log: { log: vi.fn(), warn: vi.fn() },
      }),
    ).toEqual(["dist/stale.js"]);

    expect(unlinkSync).toHaveBeenCalledWith("/pkg/dist/stale.js");
  });

  it("refuses to install when the sentinel package is missing, even for global npm config", async () => {
    const extensionsDir = await createExtensionsDir();
    const packageRoot = path.dirname(path.dirname(extensionsDir));
    await writePluginPackage(extensionsDir, "acpx", {
      dependencies: {
        acpx: "0.4.1",
      },
    });
    const spawnSync = vi.fn(() => ({ status: 0, stderr: "", stdout: "" }));

    expectRefusedWithoutSpawn(
      () =>
        runBundledPluginPostinstall({
          env: {
            npm_config_global: "true",
            npm_config_location: "global",
            npm_config_prefix: "/opt/homebrew",
            HOME: "/tmp/home",
          },
          extensionsDir,
          packageRoot,
          spawnSync,
          log: { log: vi.fn(), warn: vi.fn() },
        }),
      spawnSync,
      ["acpx@0.4.1"],
    );
  });

  it("skips reinstall when the bundled sentinel package already exists", async () => {
    const extensionsDir = await createExtensionsDir();
    const packageRoot = path.dirname(path.dirname(extensionsDir));
    await writePluginPackage(extensionsDir, "acpx", {
      dependencies: {
        acpx: "0.4.1",
      },
    });
    await fs.mkdir(path.join(packageRoot, "node_modules", "acpx"), { recursive: true });
    await fs.writeFile(
      path.join(packageRoot, "node_modules", "acpx", "package.json"),
      "{}\n",
      "utf8",
    );
    const spawnSync = vi.fn();

    runBundledPluginPostinstall({
      env: { npm_config_global: "true" },
      extensionsDir,
      packageRoot,
      spawnSync,
    });

    expect(spawnSync).not.toHaveBeenCalled();
  });

  it("finds bundled deps that npm hoisted next to the package (installed as a project dependency)", async () => {
    const project = await createTempDirAsync("enclawed-project-install-");
    const packageRoot = path.join(project, "node_modules", "enclawed");
    const extensionsDir = path.join(packageRoot, "dist", "extensions");
    await fs.mkdir(extensionsDir, { recursive: true });
    await writePluginPackage(extensionsDir, "acpx", { dependencies: { acpx: "0.4.1" } });
    await fs.mkdir(path.join(project, "node_modules", "acpx"), { recursive: true });
    await fs.writeFile(path.join(project, "node_modules", "acpx", "package.json"), "{}\n");
    const spawnSync = vi.fn();

    runBundledPluginPostinstall({
      env: { HOME: "/tmp/home" },
      extensionsDir,
      packageRoot,
      spawnSync,
      log: { log: vi.fn(), warn: vi.fn() },
    });

    expect(spawnSync).not.toHaveBeenCalled();
  });

  it("refuses when an optional native child for this platform is missing", async () => {
    const extensionsDir = await createExtensionsDir();
    const packageRoot = path.dirname(path.dirname(extensionsDir));
    await writePluginPackage(extensionsDir, "discord", {
      dependencies: {
        "@snazzah/davey": "0.1.11",
      },
    });
    await fs.mkdir(path.join(packageRoot, "node_modules", "@snazzah", "davey"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(packageRoot, "node_modules", "@snazzah", "davey", "package.json"),
      JSON.stringify({
        optionalDependencies: {
          "@snazzah/davey-win32-arm64-msvc": "0.1.11",
        },
      }),
    );
    const spawnSync = vi.fn(() => ({ status: 0, stderr: "", stdout: "" }));

    expectRefusedWithoutSpawn(
      () =>
        runBundledPluginPostinstall({
          env: { HOME: "/tmp/home" },
          extensionsDir,
          packageRoot,
          arch: "arm64",
          platform: "win32",
          spawnSync,
          log: { log: vi.fn(), warn: vi.fn() },
        }),
      spawnSync,
      ["@snazzah/davey@0.1.11"],
    );
  });

  it("does not reinstall when only another platform optional native child is missing", async () => {
    const extensionsDir = await createExtensionsDir();
    const packageRoot = path.dirname(path.dirname(extensionsDir));
    await writePluginPackage(extensionsDir, "discord", {
      dependencies: {
        "@snazzah/davey": "0.1.11",
      },
    });
    await fs.mkdir(path.join(packageRoot, "node_modules", "@snazzah", "davey"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(packageRoot, "node_modules", "@snazzah", "davey", "package.json"),
      JSON.stringify({
        optionalDependencies: {
          "@snazzah/davey-win32-arm64-msvc": "0.1.11",
        },
      }),
    );
    const spawnSync = vi.fn();

    runBundledPluginPostinstall({
      env: { HOME: "/tmp/home" },
      extensionsDir,
      packageRoot,
      arch: "arm64",
      platform: "darwin",
      spawnSync,
      log: { log: vi.fn(), warn: vi.fn() },
    });

    expect(spawnSync).not.toHaveBeenCalled();
  });

  it("does not demand the other libc's native build of an optional dependency", async () => {
    const extensionsDir = await createExtensionsDir();
    const packageRoot = path.dirname(path.dirname(extensionsDir));
    await writePluginPackage(extensionsDir, "memory-lancedb", {
      dependencies: {
        "@lancedb/lancedb": "0.27.2",
      },
    });
    await fs.mkdir(path.join(packageRoot, "node_modules", "@lancedb", "lancedb"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(packageRoot, "node_modules", "@lancedb", "lancedb", "package.json"),
      JSON.stringify({
        optionalDependencies: {
          "@lancedb/lancedb-linux-x64-gnu": "0.27.2",
          "@lancedb/lancedb-linux-x64-musl": "0.27.2",
        },
      }),
    );
    // npm 10+ installs only the glibc build on a glibc system.
    await fs.mkdir(path.join(packageRoot, "node_modules", "@lancedb", "lancedb-linux-x64-gnu"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(packageRoot, "node_modules", "@lancedb", "lancedb-linux-x64-gnu", "package.json"),
      JSON.stringify({ name: "@lancedb/lancedb-linux-x64-gnu" }),
    );
    const spawnSync = vi.fn();

    runBundledPluginPostinstall({
      env: { HOME: "/tmp/home" },
      extensionsDir,
      packageRoot,
      arch: "x64",
      platform: "linux",
      libc: "glibc",
      spawnSync,
      log: { log: vi.fn(), warn: vi.fn() },
    });
    expect(spawnSync).not.toHaveBeenCalled();

    // The same tree on a musl system lacks the build this runtime needs.
    expectRefusedWithoutSpawn(
      () =>
        runBundledPluginPostinstall({
          env: { HOME: "/tmp/home" },
          extensionsDir,
          packageRoot,
          arch: "x64",
          platform: "linux",
          libc: "musl",
          spawnSync,
          log: { log: vi.fn(), warn: vi.fn() },
        }),
      spawnSync,
      ["@lancedb/lancedb@0.27.2"],
    );
  });

  it("discovers bundled plugin runtime deps from extension manifests", async () => {
    const extensionsDir = await createExtensionsDir();
    await writePluginPackage(extensionsDir, "slack", {
      dependencies: {
        "@slack/web-api": "7.11.0",
      },
    });
    await writePluginPackage(extensionsDir, "amazon-bedrock", {
      dependencies: {
        "@aws-sdk/client-bedrock": "3.1020.0",
      },
    });

    expect(discoverBundledPluginRuntimeDeps({ extensionsDir })).toEqual(
      expect.arrayContaining([
        {
          name: "@slack/web-api",
          pluginIds: ["slack"],
          sentinelPath: path.join("node_modules", "@slack", "web-api", "package.json"),
          version: "7.11.0",
        },
        {
          name: "@aws-sdk/client-bedrock",
          pluginIds: ["amazon-bedrock"],
          sentinelPath: path.join("node_modules", "@aws-sdk", "client-bedrock", "package.json"),
          version: "3.1020.0",
        },
      ]),
    );
  });

  it("merges duplicate bundled runtime deps across plugins", async () => {
    const extensionsDir = await createExtensionsDir();
    await writePluginPackage(extensionsDir, "slack", {
      dependencies: {
        "https-proxy-agent": "^8.0.0",
      },
    });
    await writePluginPackage(extensionsDir, "discord", {
      dependencies: {
        "https-proxy-agent": "^8.0.0",
      },
    });

    expect(discoverBundledPluginRuntimeDeps({ extensionsDir })).toEqual(
      expect.arrayContaining([
        {
          name: "https-proxy-agent",
          pluginIds: ["discord", "slack"],
          sentinelPath: path.join("node_modules", "https-proxy-agent", "package.json"),
          version: "^8.0.0",
        },
      ]),
    );
  });

  it("refuses missing bundled plugin runtime deps during global installs", async () => {
    const extensionsDir = await createExtensionsDir();
    const packageRoot = path.dirname(path.dirname(extensionsDir));
    await writePluginPackage(extensionsDir, "slack", {
      dependencies: {
        "@slack/web-api": "7.11.0",
      },
    });
    await writePluginPackage(extensionsDir, "telegram", {
      dependencies: {
        grammy: "1.38.4",
      },
    });
    const spawnSync = vi.fn(() => ({ status: 0, stderr: "", stdout: "" }));

    expectRefusedWithoutSpawn(
      () =>
        runBundledPluginPostinstall({
          env: {
            npm_config_global: "true",
            npm_config_location: "global",
            npm_config_prefix: "/opt/homebrew",
            HOME: "/tmp/home",
          },
          extensionsDir,
          packageRoot,
          spawnSync,
          log: { log: vi.fn(), warn: vi.fn() },
        }),
      spawnSync,
      ["@slack/web-api@7.11.0", "grammy@1.38.4"],
    );
  });

  it("lists only the missing bundled plugin runtime deps", async () => {
    const extensionsDir = await createExtensionsDir();
    const packageRoot = path.dirname(path.dirname(extensionsDir));
    await writePluginPackage(extensionsDir, "slack", {
      dependencies: {
        "@slack/web-api": "7.11.0",
      },
    });
    await writePluginPackage(extensionsDir, "telegram", {
      dependencies: {
        grammy: "1.38.4",
      },
    });
    await fs.mkdir(path.join(packageRoot, "node_modules", "@slack", "web-api"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(packageRoot, "node_modules", "@slack", "web-api", "package.json"),
      "{}\n",
    );
    const spawnSync = vi.fn(() => ({ status: 0, stderr: "", stdout: "" }));

    expectRefusedWithoutSpawn(
      () =>
        runBundledPluginPostinstall({
          env: {
            HOME: "/tmp/home",
          },
          extensionsDir,
          packageRoot,
          spawnSync,
          log: { log: vi.fn(), warn: vi.fn() },
        }),
      spawnSync,
      ["grammy@1.38.4"],
    );
  });

  it("refuses missing bundled plugin deps when npm location is global", async () => {
    const extensionsDir = await createExtensionsDir();
    const packageRoot = path.dirname(path.dirname(extensionsDir));
    await writePluginPackage(extensionsDir, "telegram", {
      dependencies: {
        grammy: "1.38.4",
      },
    });
    const spawnSync = vi.fn(() => ({ status: 0, stderr: "", stdout: "" }));

    expectRefusedWithoutSpawn(
      () =>
        runBundledPluginPostinstall({
          env: {
            npm_config_location: "global",
            npm_config_prefix: "/opt/homebrew",
            HOME: "/tmp/home",
          },
          extensionsDir,
          packageRoot,
          spawnSync,
          log: { log: vi.fn(), warn: vi.fn() },
        }),
      spawnSync,
      ["grammy@1.38.4"],
    );
  });

  it("prunes only bundled plugin package node_modules in source checkouts", async () => {
    const packageRoot = await createTempDirAsync("enclawed-source-prune-");
    const extensionsDir = path.join(packageRoot, "extensions");
    await fs.mkdir(path.join(extensionsDir, "acpx", "node_modules"), { recursive: true });
    await fs.mkdir(path.join(extensionsDir, "fixtures", "node_modules"), { recursive: true });
    await fs.writeFile(
      path.join(extensionsDir, "acpx", "package.json"),
      JSON.stringify({ name: "@enclawed/acpx" }),
    );

    pruneBundledPluginSourceNodeModules({ extensionsDir });

    await expect(fs.stat(path.join(extensionsDir, "acpx", "node_modules"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      fs.stat(path.join(extensionsDir, "fixtures", "node_modules")),
    ).resolves.toBeTruthy();
  });

  it("skips symlink entries when pruning source-checkout bundled plugin node_modules", () => {
    const removePath = vi.fn();

    pruneBundledPluginSourceNodeModules({
      extensionsDir: "/repo/extensions",
      existsSync: vi.fn((value) => value === "/repo/extensions"),
      readdirSync: vi.fn(() => [
        {
          name: "acpx",
          isDirectory: () => true,
          isSymbolicLink: () => true,
        },
      ]),
      rmSync: removePath,
    });

    expect(removePath).not.toHaveBeenCalled();
  });
});
