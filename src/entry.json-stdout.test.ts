// Regression: on a fresh home the startup workspace-dir diagnostic used to be
// printed to stdout ahead of the JSON document of a `--json` command, so the
// output was not parseable. Runs the real CLI entry in a child process against
// a throwaway HOME and requires stdout to be exactly one JSON document.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const entry = path.join(import.meta.dirname, "entry.ts");
let home: string;

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), "entry-json-stdout-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

// Drop every inherited enclawed/state override so the child resolves its
// workspace from the fresh HOME alone (the "new install" path).
function freshHomeEnv(dir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(ENCLAWED_|OPENCLAW_|VITEST|XDG_)/.test(key) || key === "NODE_OPTIONS") {
      continue;
    }
    env[key] = value;
  }
  return {
    ...env,
    HOME: dir,
    USERPROFILE: dir,
    XDG_CONFIG_HOME: path.join(dir, ".config"),
    XDG_STATE_HOME: path.join(dir, ".state"),
    XDG_CACHE_HOME: path.join(dir, ".cache"),
    XDG_DATA_HOME: path.join(dir, ".local", "share"),
    ENCLAWEDER_DEVICE: "deny",
    NO_COLOR: "1",
  };
}

describe("--json commands on a fresh home", () => {
  it("write only the JSON document to stdout (diagnostics go to stderr)", () => {
    const res = spawnSync(process.execPath, ["--import", "tsx", entry, "conformance", "--json"], {
      cwd: path.dirname(import.meta.dirname),
      encoding: "utf8",
      env: freshHomeEnv(home),
      timeout: 170_000,
    });
    expect(res.error).toBeUndefined();
    // The workspace-dir line is still emitted, just not on stdout.
    expect(res.stderr).toContain("workspace-dir");
    expect(res.stdout).not.toContain("workspace-dir");
    const parsed = JSON.parse(res.stdout) as { results?: unknown };
    expect(Array.isArray(parsed.results)).toBe(true);
  }, 180_000);
});
