import { afterEach, describe, expect, it, vi } from "vitest";
import { importFreshModule } from "../../test/helpers/import-fresh.js";

type LoggerModule = typeof import("./logger.js");

const originalGetBuiltinModule = (
  process as NodeJS.Process & { getBuiltinModule?: (id: string) => unknown }
).getBuiltinModule;

async function importBrowserSafeLogger(params?: {
  resolvePreferredEnclawedTmpDir?: ReturnType<typeof vi.fn>;
}): Promise<{
  module: LoggerModule;
  resolvePreferredEnclawedTmpDir: ReturnType<typeof vi.fn>;
}> {
  const resolvePreferredEnclawedTmpDir =
    params?.resolvePreferredEnclawedTmpDir ??
    vi.fn(() => {
      throw new Error("resolvePreferredEnclawedTmpDir should not run during browser-safe import");
    });

  vi.doMock("../infra/tmp-enclawed-dir.js", async () => {
    const actual = await vi.importActual<typeof import("../infra/tmp-enclawed-dir.js")>(
      "../infra/tmp-enclawed-dir.js",
    );
    return {
      ...actual,
      resolvePreferredEnclawedTmpDir,
    };
  });

  Object.defineProperty(process, "getBuiltinModule", {
    configurable: true,
    value: undefined,
  });

  const module = await importFreshModule<LoggerModule>(
    import.meta.url,
    "./logger.js?scope=browser-safe",
  );
  return { module, resolvePreferredEnclawedTmpDir };
}

describe("logging/logger browser-safe import", () => {
  afterEach(() => {
    vi.doUnmock("../infra/tmp-enclawed-dir.js");
    Object.defineProperty(process, "getBuiltinModule", {
      configurable: true,
      value: originalGetBuiltinModule,
    });
  });

  it("does not resolve the preferred temp dir at import time when node fs is unavailable", async () => {
    const { module, resolvePreferredEnclawedTmpDir } = await importBrowserSafeLogger();

    expect(resolvePreferredEnclawedTmpDir).not.toHaveBeenCalled();
    expect(module.DEFAULT_LOG_DIR).toBe("/tmp/enclawed");
    expect(module.DEFAULT_LOG_FILE).toBe("/tmp/enclawed/enclawed.log");
  });

  it("disables file logging when imported in a browser-like environment", async () => {
    const { module, resolvePreferredEnclawedTmpDir } = await importBrowserSafeLogger();

    expect(module.getResolvedLoggerSettings()).toMatchObject({
      level: "silent",
      file: "/tmp/enclawed/enclawed.log",
    });
    expect(module.isFileLogLevelEnabled("info")).toBe(false);
    expect(() => module.getLogger().info("browser-safe")).not.toThrow();
    expect(resolvePreferredEnclawedTmpDir).not.toHaveBeenCalled();
  });
});
