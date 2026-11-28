// Audit-log write failures are never swallowed: the logger latches the first
// failure, and in the enclaved flavor gated tool calls refuse while it is
// latched. The log file is owner-only (0600).

import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkAuditLogForToolCall } from "./agent-tool-guard.js";
import { AuditLogger, AuditUnavailableError } from "./audit-log.js";
import { defaultEnclavedPolicy } from "./policy.js";
import { clearRuntime, setRuntime } from "./runtime.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "audit-failclosed-"));
});

afterEach(() => {
  clearRuntime();
  rmSync(dir, { recursive: true, force: true });
});

function install(audit: AuditLogger, flavor: "open" | "enclaved"): void {
  setRuntime({
    flavor,
    policy: defaultEnclavedPolicy(),
    audit,
    restoreFetch: () => {},
    fipsRequired: false,
    moduleDecisions: null,
  });
}

describe("audit log fail-closed", () => {
  it.skipIf(process.platform === "win32")(
    "creates the log owner-only (0600) and tightens an existing one",
    async () => {
      const file = path.join(dir, "audit.jsonl");
      const log = new AuditLogger({ filePath: file });
      await log.append({ type: "t", actor: "a", level: null, payload: {} });
      await log.close();
      expect(statSync(file).mode & 0o777).toBe(0o600);
      const existing = path.join(dir, "old.jsonl");
      writeFileSync(existing, "", { mode: 0o644 });
      const log2 = new AuditLogger({ filePath: existing });
      await log2.append({ type: "t", actor: "a", level: null, payload: {} });
      await log2.close();
      expect(statSync(existing).mode & 0o777).toBe(0o600);
    },
  );

  it("latches the first write failure instead of swallowing it", async () => {
    // A path under a regular file cannot be opened: ENOTDIR.
    writeFileSync(path.join(dir, "notadir"), "");
    const log = new AuditLogger({ filePath: path.join(dir, "notadir", "audit.jsonl") });
    expect(log.failure).toBeNull();
    // Fire-and-forget callers drop the promise; the latch still records it.
    log.append({ type: "t", actor: "a", level: null, payload: {} }).catch(() => {});
    await log.flush();
    expect(log.failure?.message).toMatch(/ENOTDIR/);
    expect(() => log.assertWritable()).toThrow(AuditUnavailableError);
  });

  it("refuses gated tool calls in the enclaved flavor while the log has failed", async () => {
    writeFileSync(path.join(dir, "notadir"), "");
    const log = new AuditLogger({ filePath: path.join(dir, "notadir", "audit.jsonl") });
    install(log, "enclaved");
    expect(await checkAuditLogForToolCall()).toEqual({ allowed: true });
    log
      .append({ type: "tool.irreversible.decision", actor: "a", level: null, payload: {} })
      .catch(() => {});
    const d = await checkAuditLogForToolCall();
    expect(d.allowed).toBe(false);
  });

  it("does not block in the open flavor", async () => {
    writeFileSync(path.join(dir, "notadir"), "");
    const log = new AuditLogger({ filePath: path.join(dir, "notadir", "audit.jsonl") });
    install(log, "open");
    log.append({ type: "t", actor: "a", level: null, payload: {} }).catch(() => {});
    await log.flush();
    expect(await checkAuditLogForToolCall()).toEqual({ allowed: true });
  });

  it("latches a failed head-anchor write when the anchor is required", async () => {
    const log = new AuditLogger({
      filePath: path.join(dir, "audit.jsonl"),
      anchorRequired: true,
      headAnchor: {
        id: "test",
        write: async () => {
          throw new Error("anchor unavailable");
        },
        read: async () => null,
      },
    });
    await expect(log.append({ type: "t", actor: "a", level: null, payload: {} })).rejects.toThrow(
      /anchor unavailable/,
    );
    expect(log.failure?.message).toMatch(/anchor unavailable/);
  });
});
