import { mkdtempSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HistoryStore } from "./history-store.js";
import { tightenPolicy } from "./policy-tighten.js";
import { DEFAULT_HISTORY_POLICY, defaultEnclavedPolicy } from "./policy.js";

// Settings audit #1 / item 12: a tiny history.maxAgeDays pruned the restore
// point a write admitted as reversible depends on.

const DAY = 24 * 60 * 60 * 1000;
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "history-retention-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function entry(hash: string) {
  return {
    path: "p",
    realPath: "/p",
    op: "write" as const,
    hash,
    size: 3,
    tool: "write",
    toolCallId: null,
    agentId: null,
  };
}

describe("history retention", () => {
  it("attack: limits below the floor still keep a restore point for 7 days", async () => {
    let now = Date.now();
    const s = new HistoryStore({
      dir,
      limits: { ...DEFAULT_HISTORY_POLICY, maxAgeDays: 1e-6 },
      now: () => now,
    });
    const put = await s.put(Buffer.from("old"));
    if (!put.ok) {
      throw new Error("put failed");
    }
    await s.record(entry(put.hash));
    now += 6 * DAY;
    expect(await s.prune()).toEqual({ removedEntries: 0, removedObjects: 0 });
    expect(await s.readVerified(put.hash)).toEqual(Buffer.from("old"));
    // FP: past the floor it is pruned as usual.
    now += 2 * DAY;
    expect(await s.prune()).toEqual({ removedEntries: 1, removedObjects: 1 });
  });

  it("attack: a snapshot stored but not yet indexed (pending write) is never pruned", async () => {
    let now = Date.now();
    const s = new HistoryStore({ dir, limits: DEFAULT_HISTORY_POLICY, now: () => now });
    const put = await s.put(Buffer.from("pending"));
    if (!put.ok) {
      throw new Error("put failed");
    }
    // Backdate the object past the unreferenced-object grace period.
    const objectPath = s.objectPath(put.hash);
    const old = new Date(Date.now() - 3600_000);
    utimesSync(objectPath, old, old);
    now += 3600_000;
    expect((await s.prune()).removedObjects).toBe(0);
    expect(await s.readVerified(put.hash)).toEqual(Buffer.from("pending"));
    // Once indexed, the entry keeps it; once the entry ages out it goes.
    await s.record(entry(put.hash));
    now += 40 * DAY;
    expect(await s.prune()).toEqual({ removedEntries: 1, removedObjects: 1 });
  });

  it("attack: the user config cannot shorten (or lengthen) maxAgeDays", () => {
    const base = defaultEnclavedPolicy();
    for (const maxAgeDays of [7, 365]) {
      const { policy, refused } = tightenPolicy(base, { history: { maxAgeDays } });
      expect(policy.history.maxAgeDays).toBe(base.history.maxAgeDays);
      expect(refused.join("\n")).toMatch(/history\.maxAgeDays/);
    }
  });

  it("FP: restating the base value, or the size caps going down, is accepted", () => {
    const base = defaultEnclavedPolicy();
    const { policy, refused } = tightenPolicy(base, {
      history: { maxAgeDays: base.history.maxAgeDays, maxTotalBytes: 1024 },
    });
    expect(refused).toEqual([]);
    expect(policy.history.maxTotalBytes).toBe(1024);
  });
});
