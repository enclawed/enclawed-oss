// Rotation, without breaking the chain.
//
// The log had no rotation and a production install reached 865 MB in five days
// — large enough that reading it whole threw ERR_STRING_TOO_LONG, so the chain
// became unverifiable exactly when it mattered most.
//
// The naive fix breaks the property the log exists for: a fresh file starting
// at genesis is indistinguishable from one whose history was thrown away. So a
// rotated file opens with a link record chaining from the sealed file's head,
// and the seam becomes something a verifier can check rather than something it
// must trust. These tests are mostly about the seam.

import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type AuditRecord,
  AuditLogger,
  listSegments,
  segmentLink,
  verifyChain,
  verifyHistory,
} from "../../src/enclawed/audit-log.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

function newDir(): string {
  const d = mkdtempSync(path.join(tmpdir(), "audit-rot-"));
  dirs.push(d);
  return d;
}

async function writeRecords(file: string, n: number, maxBytes: number): Promise<void> {
  const log = new AuditLogger({ filePath: file, maxBytes });
  for (let i = 0; i < n; i++) {
    await log.append({
      type: "test.entry",
      actor: "probe",
      level: "INTERNAL",
      payload: { i, pad: "x".repeat(64) },
    });
  }
  await log.close();
}

const readLines = (f: string): AuditRecord[] =>
  readFileSync(f, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as AuditRecord);

describe("audit log rotation", () => {
  it("seals a segment and keeps the chain running across the seam", async () => {
    const dir = newDir();
    const file = path.join(dir, "audit.jsonl");
    await writeRecords(file, 40, 2048);

    const segs = await listSegments(file);
    expect(segs.length).toBeGreaterThan(0);

    // The link record chains from the sealed segment's last hash, so the two
    // files are one chain rather than two.
    const sealedHead = readLines(segs[0].file).at(-1)!.recordHash;
    const firstOfNext = readLines(segs.length > 1 ? segs[1].file : file)[0];
    const link = segmentLink(firstOfNext);
    expect(link).not.toBeNull();
    expect(link!.prevHead).toBe(sealedHead);
    expect(firstOfNext.prevHash).toBe(sealedHead);
  });

  it("keeps every record: rotation splits, it never discards", async () => {
    const dir = newDir();
    const file = path.join(dir, "audit.jsonl");
    await writeRecords(file, 40, 2048);
    const segs = await listSegments(file);
    const all = [...segs.map((s) => s.file), file];
    const entries = all.flatMap((f) => readLines(f)).filter((r) => r.type === "test.entry");
    expect(entries.length).toBe(40);
    // Every payload index is present exactly once.
    const seen = new Set(entries.map((r) => (r.payload as { i: number }).i));
    expect(seen.size).toBe(40);
  });

  it("verifies the whole history across segments", async () => {
    const dir = newDir();
    const file = path.join(dir, "audit.jsonl");
    await writeRecords(file, 40, 2048);
    const r = await verifyHistory(file);
    expect(r.ok).toBe(true);
    expect(r.ok && r.segments.length).toBeGreaterThan(1);
    // count covers link records too, so it is at least the entries written.
    expect(r.ok && r.count).toBeGreaterThanOrEqual(40);
  });

  it("verifying one rotated segment says so, instead of implying it saw everything", async () => {
    const dir = newDir();
    const file = path.join(dir, "audit.jsonl");
    await writeRecords(file, 40, 2048);
    const r = await verifyChain(file);
    expect(r.ok).toBe(true);
    // The current segment starts mid-chain; a caller must be able to tell.
    expect(r.ok && r.continuesFrom).toBeDefined();
  });

  it("catches a deleted middle segment", async () => {
    // The reason a single-file check is not enough: an attacker removes an
    // entire segment and the surviving files each verify perfectly on their own.
    const dir = newDir();
    const file = path.join(dir, "audit.jsonl");
    await writeRecords(file, 60, 2048);
    const segs = await listSegments(file);
    expect(segs.length).toBeGreaterThanOrEqual(2);
    rmSync(segs[0].file);

    const r = await verifyHistory(file);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/missing|removed or replaced|gap/);
  });

  it("catches a substituted segment", async () => {
    const dir = newDir();
    const file = path.join(dir, "audit.jsonl");
    await writeRecords(file, 60, 2048);
    const segs = await listSegments(file);

    // Replace a sealed segment with a self-consistent chain of the attacker's
    // own. It verifies internally; it just does not join up.
    const other = path.join(newDir(), "other.jsonl");
    await writeRecords(other, 5, 1024 * 1024);
    writeFileSync(segs[0].file, readFileSync(other, "utf8"));

    const r = await verifyHistory(file);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/removed or replaced|missing/);
  });

  it("recovers when interrupted between sealing and writing the link", async () => {
    // A crash there leaves an empty current segment. Starting a fresh chain
    // from genesis would silently orphan everything already sealed, so the
    // writer must relink instead.
    const dir = newDir();
    const file = path.join(dir, "audit.jsonl");
    await writeRecords(file, 40, 2048);
    const segs = await listSegments(file);
    const sealedHead = readLines(segs.at(-1)!.file).at(-1)!.recordHash;

    writeFileSync(file, ""); // simulate the interruption
    const log = new AuditLogger({ filePath: file, maxBytes: 2048 });
    await log.append({ type: "after.crash", actor: "probe", level: "INTERNAL", payload: {} });
    await log.close();

    const first = readLines(file)[0];
    expect(segmentLink(first)?.prevHead).toBe(sealedHead);
    const r = await verifyHistory(file);
    expect(r.ok).toBe(true);
  });

  it("does not rotate below the threshold", async () => {
    const dir = newDir();
    const file = path.join(dir, "audit.jsonl");
    await writeRecords(file, 5, 1024 * 1024);
    expect(await listSegments(file)).toHaveLength(0);
    expect(readdirSync(dir).filter((n) => n.startsWith("audit."))).toContain("audit.jsonl");
    const r = await verifyHistory(file);
    expect(r.ok).toBe(true);
    expect(r.ok && r.segments).toHaveLength(1);
  });

  it("keeps each segment under the size it was given", async () => {
    const dir = newDir();
    const file = path.join(dir, "audit.jsonl");
    const max = 4096;
    await writeRecords(file, 60, max);
    for (const s of await listSegments(file)) {
      expect(statSync(s.file).size).toBeLessThanOrEqual(max);
    }
    expect(statSync(file).size).toBeLessThanOrEqual(max);
  });
});
