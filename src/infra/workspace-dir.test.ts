import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { withTempDir } from "../test-helpers/temp-dir.js";
import {
  _resetWorkspaceDirLogStateForTesting,
  ENCLAWED_CONFIG_FILENAME,
  ENCLAWED_DIR_NAME,
  formatRuleReason,
  logWorkspaceDirResolution,
  OPENCLAW_CONFIG_FILENAME,
  OPENCLAW_DIR_NAME,
  resolveDefaultConfigPath,
  resolveWorkspaceDirInfo,
} from "./workspace-dir.js";

function envOnly(extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined) {
      env[k] = v;
    }
  }
  return env;
}

afterEach(() => {
  _resetWorkspaceDirLogStateForTesting();
});

describe("resolveWorkspaceDirInfo", () => {
  it("picks ~/.enclawed when it exists", async () => {
    await withTempDir({ prefix: "workspace-dir-test-" }, async (root) => {
      const newDir = path.join(root, ENCLAWED_DIR_NAME);
      await fs.promises.mkdir(newDir, { recursive: true });

      const resolved = resolveWorkspaceDirInfo({
        env: envOnly({ HOME: root }),
        homedir: () => root,
      });
      expect(resolved.path).toBe(newDir);
      expect(resolved.rule).toBe("enclawed_exists");
      expect(resolved.usingLegacyDir).toBe(false);
    });
  });

  it("falls back to ~/.openclaw when only the legacy dir exists", async () => {
    await withTempDir({ prefix: "workspace-dir-test-" }, async (root) => {
      const legacyDir = path.join(root, OPENCLAW_DIR_NAME);
      await fs.promises.mkdir(legacyDir, { recursive: true });

      const resolved = resolveWorkspaceDirInfo({
        env: envOnly({ HOME: root }),
        homedir: () => root,
      });
      expect(resolved.path).toBe(legacyDir);
      expect(resolved.rule).toBe("openclaw_fallback");
      expect(resolved.usingLegacyDir).toBe(true);
    });
  });

  it("prefers ~/.enclawed when both ~/.enclawed and ~/.openclaw exist", async () => {
    await withTempDir({ prefix: "workspace-dir-test-" }, async (root) => {
      const newDir = path.join(root, ENCLAWED_DIR_NAME);
      const legacyDir = path.join(root, OPENCLAW_DIR_NAME);
      await fs.promises.mkdir(newDir, { recursive: true });
      await fs.promises.mkdir(legacyDir, { recursive: true });

      const resolved = resolveWorkspaceDirInfo({
        env: envOnly({ HOME: root }),
        homedir: () => root,
      });
      expect(resolved.path).toBe(newDir);
      expect(resolved.rule).toBe("enclawed_exists");
      expect(resolved.usingLegacyDir).toBe(false);
    });
  });

  it("returns the new-install default path when neither dir exists", async () => {
    await withTempDir({ prefix: "workspace-dir-test-" }, async (root) => {
      const expected = path.join(root, ENCLAWED_DIR_NAME);
      const resolved = resolveWorkspaceDirInfo({
        env: envOnly({ HOME: root }),
        homedir: () => root,
      });
      expect(resolved.path).toBe(expected);
      expect(resolved.rule).toBe("new_install_default");
      expect(resolved.usingLegacyDir).toBe(false);
      // The resolver does NOT create the directory itself.
      expect(fs.existsSync(expected)).toBe(false);
    });
  });

  it("honors ENCLAWED_STATE_DIR regardless of which dirs exist", async () => {
    await withTempDir({ prefix: "workspace-dir-test-" }, async (root) => {
      const override = path.join(root, "custom-state");
      // Create both legacy and new to prove the env var wins.
      await fs.promises.mkdir(path.join(root, ENCLAWED_DIR_NAME), { recursive: true });
      await fs.promises.mkdir(path.join(root, OPENCLAW_DIR_NAME), { recursive: true });

      const resolved = resolveWorkspaceDirInfo({
        env: envOnly({ HOME: root, ENCLAWED_STATE_DIR: override }),
        homedir: () => root,
      });
      expect(resolved.path).toBe(override);
      expect(resolved.rule).toBe("env_state_dir");
      expect(resolved.usingLegacyDir).toBe(false);
    });
  });

  it("honors legacy OPENCLAW_STATE_DIR when ENCLAWED_STATE_DIR is unset", () => {
    const env = envOnly({ HOME: "/tmp/no-such-home", OPENCLAW_STATE_DIR: "~/legacy-state" });
    const resolved = resolveWorkspaceDirInfo({ env, homedir: () => "/tmp/no-such-home" });
    expect(resolved.path).toBe(path.resolve("/tmp/no-such-home", "legacy-state"));
    expect(resolved.rule).toBe("env_state_dir");
  });

  it("ignores ENCLAWED_WORKSPACE_DIR for state-dir resolution (project-workspace var)", async () => {
    // ENCLAWED_WORKSPACE_DIR is the project workspace dir for docker-compose
    // and live-test scripts; it must NOT take over the user state dir.
    await withTempDir({ prefix: "workspace-dir-test-" }, async (root) => {
      const newDir = path.join(root, ENCLAWED_DIR_NAME);
      await fs.promises.mkdir(newDir, { recursive: true });
      const projectWorkspace = path.join(root, "my-project");

      const resolved = resolveWorkspaceDirInfo({
        env: envOnly({ HOME: root, ENCLAWED_WORKSPACE_DIR: projectWorkspace }),
        homedir: () => root,
      });
      expect(resolved.path).toBe(newDir);
      expect(resolved.rule).toBe("enclawed_exists");
    });
  });

  it("uses the dirname of ENCLAWED_CONFIG_PATH when set and no dir env is set", () => {
    const env = envOnly({
      HOME: "/tmp/no-such-home",
      ENCLAWED_CONFIG_PATH: "/tmp/profiles/dev/enclawed.json",
    });
    const resolved = resolveWorkspaceDirInfo({ env, homedir: () => "/tmp/no-such-home" });
    expect(resolved.path).toBe(path.resolve("/tmp/profiles/dev"));
    expect(resolved.rule).toBe("env_config_path");
  });

  it("reads agent.workspace from ~/.enclawed/enclawed.json when present", async () => {
    await withTempDir({ prefix: "workspace-dir-test-" }, async (root) => {
      const newDir = path.join(root, ENCLAWED_DIR_NAME);
      await fs.promises.mkdir(newDir, { recursive: true });
      const configured = path.join(root, "custom-from-config");
      await fs.promises.writeFile(
        path.join(newDir, ENCLAWED_CONFIG_FILENAME),
        JSON.stringify({ agent: { workspace: configured } }),
        "utf8",
      );

      const resolved = resolveWorkspaceDirInfo({
        env: envOnly({ HOME: root }),
        homedir: () => root,
      });
      expect(resolved.path).toBe(path.resolve(configured));
      expect(resolved.rule).toBe("config_key");
    });
  });

  it("reads top-level workspace key from ~/.openclaw/openclaw.json when only legacy exists", async () => {
    await withTempDir({ prefix: "workspace-dir-test-" }, async (root) => {
      const legacyDir = path.join(root, OPENCLAW_DIR_NAME);
      await fs.promises.mkdir(legacyDir, { recursive: true });
      const configured = path.join(root, "legacy-config-workspace");
      await fs.promises.writeFile(
        path.join(legacyDir, OPENCLAW_CONFIG_FILENAME),
        JSON.stringify({ workspace: configured }),
        "utf8",
      );

      const resolved = resolveWorkspaceDirInfo({
        env: envOnly({ HOME: root }),
        homedir: () => root,
      });
      expect(resolved.path).toBe(path.resolve(configured));
      expect(resolved.rule).toBe("config_key");
    });
  });

  it("ignores config files with unparseable JSON and falls through to directory probing", async () => {
    await withTempDir({ prefix: "workspace-dir-test-" }, async (root) => {
      const newDir = path.join(root, ENCLAWED_DIR_NAME);
      await fs.promises.mkdir(newDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(newDir, ENCLAWED_CONFIG_FILENAME),
        "{ not valid json",
        "utf8",
      );

      const resolved = resolveWorkspaceDirInfo({
        env: envOnly({ HOME: root }),
        homedir: () => root,
      });
      expect(resolved.path).toBe(newDir);
      expect(resolved.rule).toBe("enclawed_exists");
    });
  });
});

describe("resolveDefaultConfigPath", () => {
  it("prefers ~/.enclawed/enclawed.json when it exists", async () => {
    await withTempDir({ prefix: "workspace-dir-test-" }, async (root) => {
      const newDir = path.join(root, ENCLAWED_DIR_NAME);
      await fs.promises.mkdir(newDir, { recursive: true });
      const newConfig = path.join(newDir, ENCLAWED_CONFIG_FILENAME);
      await fs.promises.writeFile(newConfig, "{}", "utf8");

      // Also create the legacy file to prove preference order.
      const legacyDir = path.join(root, OPENCLAW_DIR_NAME);
      await fs.promises.mkdir(legacyDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(legacyDir, OPENCLAW_CONFIG_FILENAME),
        "{}",
        "utf8",
      );

      const resolved = resolveDefaultConfigPath({
        env: envOnly({ HOME: root }),
        homedir: () => root,
      });
      expect(resolved.path).toBe(newConfig);
    });
  });

  it("falls back to ~/.openclaw/openclaw.json when only legacy file exists", async () => {
    await withTempDir({ prefix: "workspace-dir-test-" }, async (root) => {
      const legacyDir = path.join(root, OPENCLAW_DIR_NAME);
      await fs.promises.mkdir(legacyDir, { recursive: true });
      const legacyConfig = path.join(legacyDir, OPENCLAW_CONFIG_FILENAME);
      await fs.promises.writeFile(legacyConfig, "{}", "utf8");

      const resolved = resolveDefaultConfigPath({
        env: envOnly({ HOME: root }),
        homedir: () => root,
      });
      expect(resolved.path).toBe(legacyConfig);
    });
  });

  it("produces the new-install path (enclawed.json) when nothing exists", async () => {
    await withTempDir({ prefix: "workspace-dir-test-" }, async (root) => {
      const resolved = resolveDefaultConfigPath({
        env: envOnly({ HOME: root }),
        homedir: () => root,
      });
      expect(resolved.path).toBe(path.join(root, ENCLAWED_DIR_NAME, ENCLAWED_CONFIG_FILENAME));
    });
  });
});

describe("logWorkspaceDirResolution", () => {
  it("emits exactly one info line per process and is idempotent", () => {
    const messages: string[] = [];
    const resolution = {
      path: "/tmp/.enclawed",
      rule: "enclawed_exists" as const,
      usingLegacyDir: false,
    };
    logWorkspaceDirResolution(resolution, (m) => messages.push(m));
    logWorkspaceDirResolution(resolution, (m) => messages.push(m));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("/tmp/.enclawed");
    expect(messages[0]).toContain(formatRuleReason("enclawed_exists"));
  });

  it("marks legacy-fallback resolutions in the log line", () => {
    const messages: string[] = [];
    logWorkspaceDirResolution(
      { path: "/tmp/.openclaw", rule: "openclaw_fallback", usingLegacyDir: true },
      (m) => messages.push(m),
    );
    expect(messages[0]).toContain("[legacy fallback]");
  });
});
