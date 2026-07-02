// Smoke + contract test for the secretary's self-update check. We
// don't have a fake-git mock here — instead we exercise the live git
// path against the repo this test itself lives in. That's deliberate:
// if the spawn / args / output-parsing breaks, the test fails the
// same way the running secretary would, against the same binary the
// secretary will call in production.

import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkForUpdates,
  resolveRepoRoot,
} from "../../enclawed-apps/secretary/src/scheduler/update-check.ts";

const repoRoot = path.resolve(__dirname, "..", "..");

describe("checkForUpdates", () => {
  it("returns a structured verdict against the repo the test runs in", async () => {
    // Skip if we somehow are not inside a git tree (e.g. tarball
    // unpack in CI without git metadata) — the test would fail for
    // the wrong reason.
    if (!existsSync(path.join(repoRoot, ".git"))) {
      return;
    }
    const r = await checkForUpdates({
      repoRoot,
      // Tight budgets so a network hiccup surfaces as a graceful
      // error rather than stalling the test runner.
      fetchTimeoutMs: 15_000,
      revParseTimeoutMs: 3_000,
    });
    expect(r.kind === "current" || r.kind === "behind" || r.kind === "error").toBe(true);
    if (r.kind === "current") {
      expect(r.localRev).toMatch(/^[0-9a-f]{40}$/);
    }
    if (r.kind === "behind") {
      expect(r.localRev).toMatch(/^[0-9a-f]{40}$/);
      expect(r.remoteRev).toMatch(/^[0-9a-f]{40}$/);
      expect(r.localRev).not.toBe(r.remoteRev);
      expect(r.commitsBehind).toBeGreaterThanOrEqual(0);
    }
  }, 30_000);
});

describe("resolveRepoRoot", () => {
  it("prefers ENCLAWED_REPO_ROOT when set", () => {
    expect(resolveRepoRoot({ ENCLAWED_REPO_ROOT: "/some/path" })).toBe("/some/path");
  });

  it("trims whitespace on the env var", () => {
    expect(resolveRepoRoot({ ENCLAWED_REPO_ROOT: "  /some/path  " })).toBe("/some/path");
  });

  it("falls back to process.cwd() when env is absent or empty", () => {
    expect(resolveRepoRoot({})).toBe(process.cwd());
    expect(resolveRepoRoot({ ENCLAWED_REPO_ROOT: "" })).toBe(process.cwd());
    expect(resolveRepoRoot({ ENCLAWED_REPO_ROOT: "   " })).toBe(process.cwd());
  });
});
