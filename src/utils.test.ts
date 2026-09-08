import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withTempDir } from "./test-helpers/temp-dir.js";
import {
  ensureDir,
  resolveConfigDir,
  resolveHomeDir,
  resolveUserPath,
  shortenHomeInString,
  shortenHomePath,
  sleep,
} from "./utils.js";

describe("ensureDir", () => {
  it("creates nested directory", async () => {
    await withTempDir({ prefix: "enclawed-test-" }, async (tmp) => {
      const target = path.join(tmp, "nested", "dir");
      await ensureDir(target);
      expect(fs.existsSync(target)).toBe(true);
    });
  });
});

describe("sleep", () => {
  it("resolves after delay using fake timers", async () => {
    vi.useFakeTimers();
    const promise = sleep(1000);
    vi.advanceTimersByTime(1000);
    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

describe("resolveConfigDir", () => {
  it("prefers ~/.enclawed when it exists on disk", async () => {
    await withTempDir({ prefix: "enclawed-config-dir-" }, async (root) => {
      const newDir = path.join(root, ".enclawed");
      await fs.promises.mkdir(newDir, { recursive: true });
      const resolved = resolveConfigDir({ HOME: root } as NodeJS.ProcessEnv, () => root);
      expect(resolved).toBe(newDir);
    });
  });

  it("falls back to ~/.enclawed when ~/.enclawed is missing (portability)", async () => {
    await withTempDir({ prefix: "enclawed-config-dir-" }, async (root) => {
      const legacyDir = path.join(root, ".enclawed");
      await fs.promises.mkdir(legacyDir, { recursive: true });
      const resolved = resolveConfigDir({ HOME: root } as NodeJS.ProcessEnv, () => root);
      expect(resolved).toBe(legacyDir);
    });
  });

  it("defaults to ~/.enclawed for new installs (neither dir exists)", async () => {
    await withTempDir({ prefix: "enclawed-config-dir-" }, async (root) => {
      const resolved = resolveConfigDir({ HOME: root } as NodeJS.ProcessEnv, () => root);
      expect(resolved).toBe(path.join(root, ".enclawed"));
    });
  });

  it("expands ENCLAWED_STATE_DIR using the provided env", () => {
    const env = {
      HOME: "/tmp/enclawed-home",
      ENCLAWED_STATE_DIR: "~/state",
    } as NodeJS.ProcessEnv;

    expect(resolveConfigDir(env)).toBe(path.resolve("/tmp/enclawed-home", "state"));
  });

  it("falls back to the config file directory when only ENCLAWED_CONFIG_PATH is set", () => {
    const env = {
      HOME: "/tmp/enclawed-home",
      ENCLAWED_CONFIG_PATH: "~/profiles/dev/enclawed.json",
    } as NodeJS.ProcessEnv;

    expect(resolveConfigDir(env)).toBe(path.resolve("/tmp/enclawed-home", "profiles", "dev"));
  });
});

describe("resolveHomeDir", () => {
  it("prefers ENCLAWED_HOME over HOME", () => {
    vi.stubEnv("ENCLAWED_HOME", "/srv/enclawed-home");
    vi.stubEnv("HOME", "/home/other");

    expect(resolveHomeDir()).toBe(path.resolve("/srv/enclawed-home"));

    vi.unstubAllEnvs();
  });
});

describe("shortenHomePath", () => {
  it("uses $ENCLAWED_HOME prefix when ENCLAWED_HOME is set", () => {
    vi.stubEnv("ENCLAWED_HOME", "/srv/enclawed-home");
    vi.stubEnv("HOME", "/home/other");

    expect(shortenHomePath(`${path.resolve("/srv/enclawed-home")}/.enclawed/enclawed.json`)).toBe(
      "$ENCLAWED_HOME/.enclawed/enclawed.json",
    );

    vi.unstubAllEnvs();
  });
});

describe("shortenHomeInString", () => {
  it("uses $ENCLAWED_HOME replacement when ENCLAWED_HOME is set", () => {
    vi.stubEnv("ENCLAWED_HOME", "/srv/enclawed-home");
    vi.stubEnv("HOME", "/home/other");

    expect(
      shortenHomeInString(`config: ${path.resolve("/srv/enclawed-home")}/.enclawed/enclawed.json`),
    ).toBe("config: $ENCLAWED_HOME/.enclawed/enclawed.json");

    vi.unstubAllEnvs();
  });
});

describe("resolveUserPath", () => {
  it("expands ~ to home dir", () => {
    expect(resolveUserPath("~", {}, () => "/Users/thoffman")).toBe(path.resolve("/Users/thoffman"));
  });

  it("expands ~/ to home dir", () => {
    expect(resolveUserPath("~/enclawed", {}, () => "/Users/thoffman")).toBe(
      path.resolve("/Users/thoffman", "enclawed"),
    );
  });

  it("resolves relative paths", () => {
    expect(resolveUserPath("tmp/dir")).toBe(path.resolve("tmp/dir"));
  });

  it("prefers ENCLAWED_HOME for tilde expansion", () => {
    vi.stubEnv("ENCLAWED_HOME", "/srv/enclawed-home");
    vi.stubEnv("HOME", "/home/other");

    expect(resolveUserPath("~/enclawed")).toBe(path.resolve("/srv/enclawed-home", "enclawed"));

    vi.unstubAllEnvs();
  });

  it("uses the provided env for tilde expansion", () => {
    const env = {
      HOME: "/tmp/enclawed-home",
      ENCLAWED_HOME: "/srv/enclawed-home",
    } as NodeJS.ProcessEnv;

    expect(resolveUserPath("~/enclawed", env)).toBe(path.resolve("/srv/enclawed-home", "enclawed"));
  });

  it("keeps blank paths blank", () => {
    expect(resolveUserPath("")).toBe("");
    expect(resolveUserPath("   ")).toBe("");
  });

  it("returns empty string for undefined/null input", () => {
    expect(resolveUserPath(undefined as unknown as string)).toBe("");
    expect(resolveUserPath(null as unknown as string)).toBe("");
  });
});
