// A hash chain proves nothing was altered or inserted. It cannot prove
// nothing was REMOVED.
//
// Deleting the trailing records leaves a shorter chain that verifies
// perfectly, so an attacker need only truncate away the entries that recorded
// what they did. Measured on this implementation before the fix: deleting the
// last four of ten records returned {ok:true, count:6} — a clean bill of
// health for a log that had just been tampered with.
//
// The fix is to remember, outside the log, what the head was. These tests pin
// the detection and, just as importantly, pin that a MISSING anchor is
// reported as unverifiable rather than as proof of integrity.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AuditLogger,
  type HeadAnchorSink,
  fileHeadAnchor,
  headAnchorPath,
  verifyChain,
} from "../../src/enclawed/audit-log.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

async function writeLog(count: number, anchor?: HeadAnchorSink): Promise<string> {
  const dir = mkdtempSync(path.join(tmpdir(), "audit-trunc-"));
  dirs.push(dir);
  const file = path.join(dir, "audit.jsonl");
  const log = new AuditLogger({ filePath: file, ...(anchor ? { headAnchor: anchor } : {}) });
  for (let i = 0; i < count; i++) {
    await log.append({ type: "test.entry", actor: "probe", level: "INTERNAL", payload: { i } });
  }
  return file;
}

function dropLastRecords(file: string, keep: number): void {
  const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
  writeFileSync(file, `${lines.slice(0, keep).join("\n")}\n`);
}

describe("truncation", () => {
  it("is caught, where the chain alone says the log is fine", async () => {
    const file = await writeLog(10);
    dropLastRecords(file, 6);
    const r = await verifyChain(file);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/removed from the end/);
  });

  it("still verifies an intact log, and says where the head was matched", async () => {
    const file = await writeLog(10);
    const r = await verifyChain(file);
    expect(r.ok).toBe(true);
    expect(r.ok && r.anchor).toBe("matched");
  });

  it("reports a missing anchor as absent rather than as integrity", async () => {
    // The honest failure. Without an anchor the log CANNOT be shown complete,
    // and saying "ok" with no qualification would be a lie of omission --
    // which is exactly what deleting the sidecar buys an attacker.
    const file = await writeLog(10);
    dropLastRecords(file, 6);
    rmSync(headAnchorPath(file));
    const r = await verifyChain(file);
    expect(r.ok).toBe(true);
    expect(r.ok && r.anchor).toBe("absent");
  });
});

describe("what the chain already caught, and must keep catching", () => {
  it("detects an in-place edit", async () => {
    const file = await writeLog(10);
    const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
    const rec = JSON.parse(lines[3]) as { payload: unknown };
    rec.payload = { i: 999 };
    lines[3] = JSON.stringify(rec);
    writeFileSync(file, `${lines.join("\n")}\n`);
    const r = await verifyChain(file);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe("recordHash mismatch");
    expect(!r.ok && r.brokenAt).toBe(3);
  });
});

describe("the anchor is a sink, so it can move off this disk", () => {
  it("accepts an alternative sink for both writing and verifying", async () => {
    // Stands in for the hardware root or a distributed ledger: the point is
    // that the chain logic does not care where the head is kept, only that
    // whoever can rewrite the log cannot also rewrite the anchor.
    const store = { hash: null as string | null };
    const external: HeadAnchorSink = {
      id: "test-external",
      async write(h) {
        store.hash = h;
      },
      async read() {
        return store.hash;
      },
    };
    const file = await writeLog(10, external);
    expect(store.hash).toMatch(/^[0-9a-f]{64}$/);

    // Truncating the log AND deleting the on-disk sidecar does not help when
    // the anchor lives somewhere else.
    dropLastRecords(file, 6);
    rmSync(headAnchorPath(file), { force: true });
    const r = await verifyChain(file, external);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/removed from the end/);
  });

  it("defaults to the file sink when none is given", async () => {
    const file = await writeLog(3);
    expect(fileHeadAnchor(file).id).toBe("file");
    expect(await fileHeadAnchor(file).read()).toMatch(/^[0-9a-f]{64}$/);
  });
});
