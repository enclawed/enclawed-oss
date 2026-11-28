// The prebuilt name guards' policy self-test (`name-guard selftest`): the
// host arch natively, the other arch under qemu-user when one is available
// (ENCLAWED_TEST_QEMU_AARCH64, or qemu-aarch64 on PATH). qemu-user cannot
// run seccomp user notification, so on the emulated arch this checks the
// policy code only; the supervisor and shim run natively in the live tests.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { prebuiltCandidates } from "../prebuilt/name-guard.js";
import { nameGuardConfig } from "./name-guard.js";

const binaryFor = (arch: string) => prebuiltCandidates(arch).find((p) => fs.existsSync(p)) ?? null;
const qemu =
  process.env.ENCLAWED_TEST_QEMU_AARCH64 ??
  (spawnSync("sh", ["-c", "command -v qemu-aarch64"], { encoding: "utf8" }).stdout.trim() || null);

const PATHS: Array<[string, "deny" | "allow"]> = [
  ["/p/a/.envrc", "deny"],
  ["/p/pkg/.vscode/tasks.json", "deny"],
  ["/p/.git/hooks/pre-commit", "deny"],
  ["/p/.git/config.lock", "deny"],
  ["/p/x/.mcp.json", "deny"],
  // As a Windows file system (WSL's /mnt/c) names them: trailing dots and spaces dropped.
  ["/p/.github./workflows/x.yml", "deny"],
  ["/p/.GitHub /workflows/x.yml", "deny"],
  ["/p/.mcp.json.", "deny"],
  ["/p/.claude. /settings.json", "deny"],
  ["/p/.mcp.json:x", "deny"],
  ["/p/.../x", "deny"],
  ["/p/src/a.ts", "allow"],
  ["/p/src/a.ts.", "allow"],
  ["/p/logs/12:00.log", "allow"],
  ["/p/node_modules/x/.envrc", "allow"],
  ["/tmp/.envrc", "allow"],
];

function selftest(run: string[]): string[] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guard-selftest-"));
  try {
    const conf = path.join(dir, "conf");
    fs.writeFileSync(conf, nameGuardConfig(["/p"], []));
    const r = spawnSync(run[0], [...run.slice(1), "selftest", conf, ...PATHS.map(([p]) => p)], {
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(r.status, r.stderr).toBe(0);
    return r.stdout.trim().split("\n");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const expected = PATHS.map(([p, v]) => `${v} ${p}`);

describe("prebuilt name guard self-test", () => {
  const host = process.arch;
  it.skipIf(process.platform !== "linux" || !binaryFor(host))(`linux-${host}, natively`, () => {
    expect(selftest([binaryFor(host)!])).toEqual(expected);
  });
  it.skipIf(host !== "x64" || !binaryFor("arm64") || !qemu)("linux-arm64, under qemu-user", () => {
    expect(selftest([qemu!, binaryFor("arm64")!])).toEqual(expected);
  });
});
