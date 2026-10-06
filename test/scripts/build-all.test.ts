import { describe, expect, it } from "vitest";
import {
  BUILD_ALL_PROFILES,
  BUILD_ALL_STEPS,
  resolveBuildAllStep,
  resolveBuildAllSteps,
} from "../../scripts/build-all.mjs";

describe("resolveBuildAllStep", () => {
  it("routes pnpm steps through the npm_execpath pnpm runner on Windows", () => {
    const step = BUILD_ALL_STEPS.find((entry) => entry.label === "canvas:a2ui:bundle");
    expect(step).toBeTruthy();

    // The flag is passed in so this stays a test of WINDOWS PNPM ROUTING and
    // nothing else. resolveStepEnv injects ENCLAWED_A2UI_SKIP_MISSING itself
    // when vendor/a2ui is absent, which made the expected env depend on whether
    // that directory happened to exist in the checkout -- so the assertion
    // passed in a full tree and could never pass in a flattened one. Supplying
    // it makes the injection a no-op and the result deterministic everywhere.
    const env = { ENCLAWED_A2UI_SKIP_MISSING: "1" };
    const result = resolveBuildAllStep(step, {
      platform: "win32",
      nodeExecPath: "C:\\Program Files\\nodejs\\node.exe",
      npmExecPath: "C:/Users/test/AppData/Local/pnpm/10.32.1/bin/pnpm.cjs",
      env,
    });

    expect(result).toEqual({
      command: "C:\\Program Files\\nodejs\\node.exe",
      args: ["C:/Users/test/AppData/Local/pnpm/10.32.1/bin/pnpm.cjs", "canvas:a2ui:bundle"],
      options: {
        stdio: "inherit",
        env,
        shell: false,
        windowsVerbatimArguments: undefined,
      },
    });
  });

  it("keeps node steps on the current node binary", () => {
    const step = BUILD_ALL_STEPS.find((entry) => entry.label === "runtime-postbuild");
    expect(step).toBeTruthy();

    const result = resolveBuildAllStep(step, {
      nodeExecPath: "/custom/node",
      env: { FOO: "bar" },
    });

    expect(result).toEqual({
      command: "/custom/node",
      args: ["scripts/runtime-postbuild.mjs"],
      options: {
        stdio: "inherit",
        env: { FOO: "bar" },
      },
    });
  });

  it("adds heap headroom for plugin-sdk dts on Windows", () => {
    const step = BUILD_ALL_STEPS.find((entry) => entry.label === "build:plugin-sdk:dts");
    expect(step).toBeTruthy();

    const result = resolveBuildAllStep(step, {
      platform: "win32",
      nodeExecPath: "C:\\Program Files\\nodejs\\node.exe",
      npmExecPath: "C:/Users/test/AppData/Local/pnpm/10.32.1/bin/pnpm.cjs",
      env: { FOO: "bar" },
    });

    expect(result).toEqual({
      command: "C:\\Program Files\\nodejs\\node.exe",
      args: ["C:/Users/test/AppData/Local/pnpm/10.32.1/bin/pnpm.cjs", "build:plugin-sdk:dts"],
      options: {
        stdio: "inherit",
        env: {
          FOO: "bar",
          NODE_OPTIONS: "--max-old-space-size=4096",
        },
        shell: false,
        windowsVerbatimArguments: undefined,
      },
    });
  });
});

describe("resolveBuildAllSteps", () => {
  it("keeps the full profile aligned with the declared steps", () => {
    expect(resolveBuildAllSteps("full")).toEqual(BUILD_ALL_STEPS);
    expect(BUILD_ALL_PROFILES.full).toEqual(BUILD_ALL_STEPS.map((step) => step.label));
  });

  it("uses a runtime-only profile for ci artifacts", () => {
    expect(resolveBuildAllSteps("ciArtifacts").map((step) => step.label)).toEqual([
      "canvas:a2ui:bundle",
      "tsdown",
      "runtime-postbuild",
      "write-npm-update-compat-sidecars",
      "build-stamp",
      "canvas-a2ui-copy",
      "copy-hook-metadata",
      "copy-export-html-templates",
      "write-build-info",
      "write-cli-startup-metadata",
      "write-cli-compat",
    ]);
  });

  it("rejects unknown build profiles", () => {
    expect(() => resolveBuildAllSteps("wat")).toThrow("Unknown build profile: wat");
  });
});
