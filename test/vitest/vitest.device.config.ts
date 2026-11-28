import { defineConfig } from "vitest/config";
import baseConfig from "./vitest.config.ts";

// `pnpm test:device`: the tests that drive a REAL attached Enclaweder (*.hardware.test.ts),
// which the default suite excludes. The framework refuses every real-device open under a test
// runner unless ENCLAWEDER_LIVE_DEVICE_TEST=I_UNDERSTAND is set, and this config refuses to
// start without it, so a live-device run is always a deliberate act of the operator.
if (process.env.ENCLAWEDER_LIVE_DEVICE_TEST !== "I_UNDERSTAND") {
  throw new Error(
    "pnpm test:device drives the REAL attached Enclaweder (it binds the device, opens its host session and can latch it). " +
      "Run it only on purpose: ENCLAWEDER_LIVE_DEVICE_TEST=I_UNDERSTAND pnpm test:device",
  );
}

const base = baseConfig as unknown as Record<string, unknown>;
const baseTestWithProjects =
  (baseConfig as { test?: { exclude?: string[]; setupFiles?: string[] } }).test ?? {};
const { projects: _projects, ...baseTest } = baseTestWithProjects as {
  exclude?: string[];
  projects?: string[];
  setupFiles?: string[];
};
const exclude = (baseTest.exclude ?? []).filter((p) => p !== "**/*.hardware.test.ts");

export default defineConfig({
  ...base,
  test: {
    ...baseTest,
    disableConsoleIntercept: true,
    // One device, one test process: the tests run in order (takeover first, removal last).
    maxWorkers: 1,
    fileParallelism: false,
    include: ["src/**/*.hardware.test.ts"],
    exclude,
  },
});
