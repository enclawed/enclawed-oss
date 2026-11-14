import { beforeEach, describe, expect, it } from "vitest";
import { createPluginRecord } from "../plugins/status.test-helpers.js";
import {
  buildPluginDiagnosticsReport,
  buildPluginSnapshotReport,
  resetPluginsCliTestState,
  runPluginsCommand,
  runtimeLogs,
} from "./plugins-cli-test-helpers.js";

describe("plugins cli list", () => {
  beforeEach(() => {
    resetPluginsCliTestState();
  });

  it("includes imported state in JSON output", async () => {
    buildPluginSnapshotReport.mockReturnValue({
      workspaceDir: "/workspace",
      plugins: [
        createPluginRecord({
          id: "demo",
          imported: true,
          activated: true,
          explicitlyEnabled: true,
        }),
      ],
      diagnostics: [],
    });

    await runPluginsCommand(["plugins", "list", "--json"]);

    expect(buildPluginSnapshotReport).toHaveBeenCalledWith();

    expect(JSON.parse(runtimeLogs[0] ?? "null")).toEqual({
      workspaceDir: "/workspace",
      plugins: [
        expect.objectContaining({
          id: "demo",
          imported: true,
          activated: true,
          explicitlyEnabled: true,
        }),
      ],
      diagnostics: [],
    });
  });

  it("keeps doctor on a module-loading snapshot", async () => {
    buildPluginDiagnosticsReport.mockReturnValue({
      plugins: [],
      diagnostics: [],
    });

    await runPluginsCommand(["plugins", "doctor"]);

    expect(buildPluginDiagnosticsReport).toHaveBeenCalledWith();
    expect(runtimeLogs).toContain("No plugin issues detected.");
  });

  it("emits machine-readable JSON for `plugins doctor --json`", async () => {
    buildPluginDiagnosticsReport.mockReturnValue({
      workspaceDir: "/workspace",
      plugins: [
        createPluginRecord({
          id: "byteplus",
          status: "error",
          source: "bundled",
          failurePhase: "load",
          error: "buildManifestModelProviderConfig is not defined",
        }),
        createPluginRecord({
          id: "ok-plugin",
          status: "loaded",
          source: "bundled",
        }),
      ],
      diagnostics: [
        {
          level: "error",
          pluginId: "byteplus",
          source: "bundled",
          message: "failed to load plugin: buildManifestModelProviderConfig is not defined",
        },
      ],
    });

    await runPluginsCommand(["plugins", "doctor", "--json"]);

    const parsed = JSON.parse(runtimeLogs[0] ?? "null");
    expect(parsed.workspaceDir).toBe("/workspace");
    expect(parsed.summary).toEqual({
      total: 2,
      loaded: 1,
      errored: 1,
      errorDiagnostics: 1,
      compatibilityNotices: 0,
    });
    expect(parsed.plugins).toEqual([
      expect.objectContaining({
        id: "byteplus",
        status: "error",
        source: "bundled",
        failurePhase: "load",
        error: "buildManifestModelProviderConfig is not defined",
      }),
      expect.objectContaining({
        id: "ok-plugin",
        status: "loaded",
        source: "bundled",
      }),
    ]);
    expect(parsed.diagnostics).toEqual([
      {
        level: "error",
        pluginId: "byteplus",
        source: "bundled",
        message: "failed to load plugin: buildManifestModelProviderConfig is not defined",
      },
    ]);
    expect(parsed.compatibility).toEqual([]);
  });
});
