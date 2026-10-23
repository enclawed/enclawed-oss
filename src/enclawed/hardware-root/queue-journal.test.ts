// The device request journal as a log: every request and outcome recorded
// in order, and any record removed, altered or inserted seen. The device's
// checkpoints are tested on a real Enclaweder in
// swarm/enclaweder.hardware.test.ts.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { DeviceScheduler } from "./broker.js";
import { QueueJournal, verifyQueueJournal } from "./queue-journal.js";

const dir = mkdtempSync(path.join(os.tmpdir(), "queue-journal-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
let n = 0;
const fresh = () => path.join(dir, `q${n++}.jsonl`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const work = async (d: Buffer) => {
  await sleep(5);
  return { uid: Buffer.alloc(12, 1), sig: Buffer.concat([d, d]) };
};
const lines = (f: string) => readFileSync(f, "utf8").split("\n").filter(Boolean);

async function journaled(file: string) {
  const journal = new QueueJournal(file);
  const s = new DeviceScheduler(work, () => 1, {
    maxQueued: 2,
    maxWaitMs: 1000,
    journal,
    checkpointMs: 60_000,
  });
  await Promise.all([1, 2].map((i) => s.submit(1, Buffer.alloc(32, i))));
  await s.submit(2, Buffer.alloc(32, 3));
  const flood = [4, 5, 6, 7].map((i) =>
    s.submit(3, Buffer.alloc(32, i)).catch((e: Error) => e.message),
  );
  await Promise.all(flood);
  s.stop();
  await journal.close();
  return { journal, s };
}

describe("device request journal", () => {
  it("records every request before it runs and every outcome before it returns", async () => {
    const f = fresh();
    await journaled(f);
    const types = lines(f).map((l) => (JSON.parse(l) as { type: string }).type);
    // Each signature follows its own request; refusals are recorded too.
    expect(types.filter((t) => t === "device.request").length).toBeGreaterThanOrEqual(5);
    expect(types.filter((t) => t === "device.signed").length).toBeGreaterThanOrEqual(5);
    expect(types).toContain("device.refused");
    const r = await verifyQueueJournal(f, []);
    expect(r.chain.ok).toBe(true);
    expect(r.orphanSignatures).toBe(0);
    expect(r.ok).toBe(true);
  });

  it("is broken by removing any record", async () => {
    const f = fresh();
    await journaled(f);
    const l = lines(f);
    writeFileSync(f, [...l.slice(0, 2), ...l.slice(3)].join("\n") + "\n");
    expect((await verifyQueueJournal(f, [])).ok).toBe(false);
  });

  it("is broken by altering a record", async () => {
    const f = fresh();
    await journaled(f);
    const l = lines(f);
    const rec = JSON.parse(l[0]) as { payload: { digest: string } };
    rec.payload.digest = "ff".repeat(32);
    l[0] = JSON.stringify(rec);
    writeFileSync(f, l.join("\n") + "\n");
    expect((await verifyQueueJournal(f, [])).ok).toBe(false);
  });

  it("is broken by cutting off its newest records", async () => {
    const f = fresh();
    await journaled(f);
    const l = lines(f);
    writeFileSync(f, l.slice(0, l.length - 2).join("\n") + "\n");
    expect((await verifyQueueJournal(f, [])).ok).toBe(false);
  });

  it("flags a signature handed out with no request before it", async () => {
    const f = fresh();
    const journal = new QueueJournal(f);
    await journal.signed(9, 1, Buffer.alloc(12, 1), Buffer.alloc(64, 2));
    await journal.close();
    const r = await verifyQueueJournal(f, []);
    expect(r.orphanSignatures).toBe(1);
    expect(r.ok).toBe(false);
  });
});
