// Memory budgets never refuse a legitimate repeat and never re-send one at a
// time the agent chooses. An outcome that leaves memory is spilled to a
// private file; one that cannot be spilled keeps its key in the refresh
// rotation, and a repeat waits for that key's next scheduled refresh.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createActionBatcher,
  DEFAULT_ACTION_BATCHER_OPTIONS,
  type ActionRelease,
  type RefreshFn,
} from "./action-batcher.js";
import type { EgressAction } from "./action.js";

const get = (url: string): EgressAction => ({ type: "http", method: "GET", url });
const BIG = 40 * 1024 * 1024; // two of these exceed the 64 MiB scope budget

const created: Array<{ dispose(): void }> = [];
afterEach(() => {
  for (const b of created.splice(0)) {
    b.dispose();
  }
});

function setup(spillDir: string | null) {
  const wire: string[] = [];
  const batcher = createActionBatcher(DEFAULT_ACTION_BATCHER_OPTIONS, {
    now: () => 1_000,
    setTimer: () => null,
    clearTimer: () => {},
    randomInt: (min) => min,
    spillDir,
  });
  created.push(batcher);
  // A recorded GET whose refresh re-issues it through "the tool" (wire log).
  const record = async (url: string, body: unknown, withRefresh = true) => {
    const id = `${url}#${wire.length}`;
    const p = batcher.submit({ id, action: get(url), scope: "run" });
    batcher.flush("run");
    expect((await p).outcome).toBe("execute");
    wire.push(url);
    let n = 0;
    const refresh: RefreshFn = async () => {
      wire.push(url);
      return { ok: true, response: { body, refreshed: ++n } };
    };
    batcher.complete(id, { body }, BIG, withRefresh ? refresh : undefined);
  };
  return { batcher, wire, record };
}

describe("action batcher under memory pressure", () => {
  it("spills the oldest outcome and answers its repeat from the spill file", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "batcher-spill-"));
    try {
      const { batcher, wire, record } = setup(dir);
      await record("https://a.test/1", "one");
      await record("https://a.test/2", "two");
      expect(fs.readdirSync(dir)).toHaveLength(1);
      const repeat = await batcher.submit({
        id: "r",
        action: get("https://a.test/1"),
        scope: "run",
      });
      expect(repeat).toMatchObject({ outcome: "cached", ok: true, response: { body: "one" } });
      expect(wire).toEqual(["https://a.test/1", "https://a.test/2"]);
      batcher.endScope("run");
      expect(fs.readdirSync(dir)).toHaveLength(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("without spilling, a repeat waits for its key's next scheduled refresh: not refused, not re-sent now", async () => {
    const { batcher, wire, record } = setup(null);
    await record("https://a.test/1", "one");
    await record("https://a.test/2", "two");
    let settled: ActionRelease | undefined;
    const repeat = batcher
      .submit({ id: "r", action: get("https://a.test/1"), scope: "run" })
      .then((r) => (settled = r));
    await new Promise((resolve) => setImmediate(resolve));
    expect(settled).toBeUndefined();
    expect(wire).toHaveLength(2); // nothing left for the repeat
    await batcher.refreshTick();
    await repeat;
    expect(settled).toMatchObject({ outcome: "cached", ok: true, response: { body: "one" } });
  });

  it("the refresh rounds are the same whether or not an outcome was dropped or a repeat waits", async () => {
    const rounds = async (spillDir: string | null, repeat: boolean) => {
      const { batcher, wire, record } = setup(spillDir);
      await record("https://a.test/1", "one");
      await record("https://a.test/2", "two");
      if (repeat) {
        void batcher.submit({ id: "r", action: get("https://a.test/1"), scope: "run" });
      }
      await batcher.refreshTick();
      await batcher.refreshTick();
      await new Promise((resolve) => setImmediate(resolve));
      return wire;
    };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "batcher-spill-"));
    try {
      const reference = await rounds(dir, false);
      expect(await rounds(dir, true)).toEqual(reference);
      expect(await rounds(null, false)).toEqual(reference);
      expect(await rounds(null, true)).toEqual(reference);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses (sends nothing) only when a dropped outcome cannot be re-issued on schedule", async () => {
    const { batcher, wire, record } = setup(null);
    await record("https://a.test/1", "one", false);
    await record("https://a.test/2", "two", false);
    const repeat = await batcher.submit({ id: "r", action: get("https://a.test/1"), scope: "run" });
    expect(repeat.outcome).toBe("blocked");
    expect(wire).toEqual(["https://a.test/1", "https://a.test/2"]);
  });

  it("never spills an outcome a round trip would change (an Error keeps its class)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "batcher-spill-"));
    try {
      const { batcher } = setup(dir);
      class ToolError extends Error {
        code = "E_TOOL";
      }
      const err = new ToolError("boom");
      const p = batcher.submit({ id: "e", action: get("https://a.test/e"), scope: "run" });
      batcher.flush("run");
      await p;
      batcher.fail("e", err, BIG, async () => ({ ok: false, response: err }));
      const q = batcher.submit({ id: "f", action: get("https://a.test/f"), scope: "run" });
      batcher.flush("run");
      await q;
      batcher.complete("f", "y", BIG);
      expect(fs.readdirSync(dir)).toHaveLength(0);
      const repeat = batcher.submit({ id: "r", action: get("https://a.test/e"), scope: "run" });
      await batcher.refreshTick();
      const r = (await repeat) as { outcome: string; response: unknown };
      expect(r.outcome).toBe("cached");
      expect(r.response).toBe(err);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
