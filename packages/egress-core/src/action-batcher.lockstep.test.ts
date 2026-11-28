// Lockstep padding: a real GET that reaches its slot late never hangs, even
// when the run has ended and no later window would open; and dummies are
// paced like real requests (no dummy leaves before every real one is at its
// slot).

import { afterEach, describe, expect, it } from "vitest";
import { createActionBatcher, DEFAULT_ACTION_BATCHER_OPTIONS } from "./action-batcher.js";
import { requestToolIssueSlot, type EgressAction, type ToolRequestClient } from "./action.js";

const get = (url: string): EgressAction => ({ type: "http", method: "GET", url });
const set = ["https://p.test/0", "https://p.test/1", "https://p.test/2"];

const created: Array<{ dispose(): void }> = [];
afterEach(() => {
  for (const b of created.splice(0)) {
    b.dispose();
  }
});

function padded() {
  const wire: string[] = [];
  const client: ToolRequestClient = {
    check: async () => ({ ok: true }),
    send: async (url) => {
      wire.push(`dummy ${url}`);
    },
  };
  const batcher = createActionBatcher(
    {
      ...DEFAULT_ACTION_BATCHER_OPTIONS,
      windowMs: 20,
      padding: { enabled: true, allowedSet: set.map(get) },
    },
    { paddingClient: () => client, issuedTimeoutMs: 50 },
  );
  created.push(batcher);
  return { batcher, wire };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("lockstep padding", () => {
  it("a real GET that reaches its slot after it expired is released in a window it opens itself, even after the run ended", async () => {
    const { batcher, wire } = padded();
    const r = await batcher.submit({ id: "c1", action: get(set[1]), scope: "run" });
    expect(r.outcome).toBe("execute");
    // The tool stalls past its slot: a substitute fills it.
    await sleep(150);
    expect(wire.filter((w) => w === `dummy ${set[1]}`)).toHaveLength(1);
    // The agent's turn ends; nothing else will open a window for this run.
    batcher.endScope("run");
    wire.length = 0;
    const late = requestToolIssueSlot("web_fetch", set[1], "c1").then(() =>
      wire.push(`real ${set[1]}`),
    );
    const outcome = await Promise.race([
      late.then(() => "released"),
      sleep(2_000).then(() => "hung"),
    ]);
    expect(outcome).toBe("released");
    await sleep(20);
    // That window shows the full set once: the late real fills its key's slot.
    expect(wire.toSorted()).toEqual(
      [`dummy ${set[0]}`, `dummy ${set[2]}`, `real ${set[1]}`].toSorted(),
    );
  });

  it("no dummy leaves before every released real GET has reached its slot", async () => {
    const { batcher, wire } = padded();
    const r = await batcher.submit({ id: "c1", action: get(set[2]), scope: "run" });
    expect(r.outcome).toBe("execute");
    await sleep(30); // the tool is still preparing its request
    expect(wire).toEqual([]);
    await requestToolIssueSlot("web_fetch", set[2], "c1");
    wire.push(`real ${set[2]}`);
    await sleep(20);
    expect(wire).toHaveLength(3);
  });
});
