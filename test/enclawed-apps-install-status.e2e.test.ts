// `enclawed <app> --status` has to survive the state it is meant to report on.
//
// It has now crashed in production twice, both times on a healthy install whose
// only sin was a large audit log: once reading an 810 MB file into a string
// (ERR_STRING_TOO_LONG), and once on a ReferenceError because a `const` the
// function needed was declared after the top-level dispatch that calls it, so
// it was still in the temporal dead zone.
//
// Neither was reachable by any static check -- the second is invisible to
// no-use-before-define, which exempts references inside a function body because
// it cannot know the function runs during module evaluation. The only thing
// that catches this class is running the command, so that is what this does.
//
// The log below is deliberately larger than AUDIT_SIZE_WARN_BYTES: the warning
// branch is exactly where the last crash was, and a fixture under the threshold
// would have passed while production died.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupTempDirs, makeTempDir } from "./helpers/temp-dir.js";

const INSTALL_MJS = path.resolve(process.cwd(), "enclawed-apps", "install.mjs");
const WARN_BYTES = 128 * 1024 * 1024;

function writeAuditLog(file: string, atLeastBytes: number): number {
  const line = `${JSON.stringify({
    ts: "2026-09-05T22:00:00Z",
    type: "test.entry",
    actor: "probe",
    level: "INTERNAL",
    payload: { pad: "x".repeat(200) },
  })}\n`;
  const chunk = line.repeat(1000);
  const fd = fs.openSync(file, "w");
  let written = 0;
  while (written < atLeastBytes) {
    fs.writeSync(fd, chunk);
    written += chunk.length;
  }
  fs.closeSync(fd);
  return written / line.length;
}

function runStatus(home: string): { status: number | null; out: string } {
  const r = spawnSync(process.execPath, [INSTALL_MJS, "executive-assistant", "--status"], {
    env: { ...process.env, HOME: home, USERPROFILE: home },
    encoding: "utf8",
    timeout: 180_000,
  });
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

describe("enclawed-apps install.mjs --status", () => {
  const roots: string[] = [];
  afterEach(() => {
    cleanupTempDirs(roots);
  });

  it("reports on an audit log too large to hold in memory, instead of crashing", () => {
    const home = makeTempDir(roots, "enclawed-status-");
    const appDir = path.join(home, ".enclawed", "enclawed-apps", "executive-assistant");
    fs.mkdirSync(appDir, { recursive: true });
    const records = writeAuditLog(path.join(appDir, "audit.jsonl"), WARN_BYTES + 8 * 1024 * 1024);

    const { status, out } = runStatus(home);

    // The specific failures this test exists for.
    expect(out).not.toMatch(/ERR_STRING_TOO_LONG/);
    expect(out).not.toMatch(/before initialization/);
    expect(out).not.toMatch(/ReferenceError|TypeError/);
    expect(status).toBe(0);

    // And it did the job, rather than merely not dying.
    expect(out).toMatch(/Status of/);
    expect(out).toMatch(new RegExp(`${records} records`));
    expect(out).toMatch(/audit history/); // the >128 MB warning branch
  });

  it("still works when there is no audit log at all", () => {
    const home = makeTempDir(roots, "enclawed-status-empty-");
    fs.mkdirSync(path.join(home, ".enclawed", "enclawed-apps", "executive-assistant"), {
      recursive: true,
    });
    const { status, out } = runStatus(home);
    expect(out).not.toMatch(/ReferenceError|TypeError/);
    expect(status).toBe(0);
    expect(out).toMatch(/Status of/);
  });
});
