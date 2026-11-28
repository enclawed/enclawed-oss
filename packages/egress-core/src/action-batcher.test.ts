import { afterEach, describe, expect, it } from "vitest";
import {
  createActionBatcher,
  DEFAULT_ACTION_BATCHER_OPTIONS,
  getActionBatcher,
  registerActionBatcher,
  resetActionBatcher,
  resolveActionBatcherOptions,
  type ActionBatcherOptions,
  type ActionRelease,
} from "./action-batcher.js";
import {
  actionKey,
  canonicalActionEncoding,
  classifyActionIdempotency,
  outboundGetUrl,
  requestToolIssueSlot,
  setToolCapabilityClassifier,
  setToolRequestClient,
  type EgressAction,
  type ToolRequestClient,
} from "./action.js";
import { createCapacityLedger } from "./ledger.js";
import type { Finding } from "./types.js";

const get = (url: string): EgressAction => ({ type: "http", method: "GET", url });
const post = (url: string): EgressAction => ({ type: "http", method: "POST", url, body: "x" });

/**
 * A padding client that records what it sends. `wire` is the observer's view:
 * every request in the order it left, real GETs included (reported through
 * `notifyToolRequestIssued`, as the open core's web_fetch does).
 */
function recordingClient(refuse: (url: string) => string | null = () => null) {
  const padded: EgressAction[] = [];
  const wire: string[] = [];
  const client: ToolRequestClient = {
    check: async (url) => {
      const reason = refuse(url);
      return reason ? { ok: false, reason } : { ok: true };
    },
    send: async (url) => {
      padded.push(get(url));
      wire.push(url);
    },
  };
  return { client, padded, wire };
}

// Every batcher listens on the shared issue-slot listener set: dispose each
// one after its test so a stale instance cannot answer another test's slot.
const created: Array<{ dispose(): void }> = [];
function track<T extends { dispose(): void }>(batcher: T): T {
  created.push(batcher);
  return batcher;
}

/** Batcher on a manual clock: windows close only on `flush()`. */
function manual(
  overrides: Partial<ActionBatcherOptions> = {},
  client: ToolRequestClient | null = null,
) {
  let t = 1_000;
  const rec = recordingClient();
  const findings: Finding[] = [];
  const batcher = track(
    createActionBatcher(
      { ...DEFAULT_ACTION_BATCHER_OPTIONS, ...overrides },
      {
        now: () => t,
        setTimer: () => null,
        clearTimer: () => {},
        paddingClient: () => client ?? rec.client,
        issuedTimeoutMs: 50,
        audit: (_scope, f) => findings.push(f),
      },
    ),
  );
  return {
    batcher,
    padded: rec.padded,
    wire: rec.wire,
    findings,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

/**
 * Submit all, flush, return releases plus the order executed ids left in.
 * Plays the tool as the open core's web_fetch does: a released GET waits for
 * its issue slot and leaves (is pushed to `wire`) when the slot opens.
 */
async function runWindow(
  batcher: ReturnType<typeof manual>["batcher"],
  items: Array<{ id: string; action: EgressAction; dependsOn?: string[]; dataFlowFrom?: string[] }>,
  wire: string[] = [],
  scope = "run-1",
) {
  const order: string[] = [];
  const promises = items.map((item) =>
    batcher.submit({ ...item, scope }).then(async (r) => {
      if (r.outcome === "execute") {
        if (item.action.type === "http" && item.action.method === "GET") {
          await requestToolIssueSlot("web_fetch", item.action.url, item.id);
          wire.push(item.action.url);
        }
        order.push(item.id);
      }
      return r;
    }),
  );
  batcher.flush();
  const releases = await Promise.all(promises);
  // Let a lockstep window finish its dispatch (padding after the last real).
  await settleDispatch();
  return { order, releases };
}

async function settleDispatch(turns = 40) {
  for (let i = 0; i < turns; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

afterEach(() => {
  for (const b of created.splice(0)) {
    b.dispose();
  }
  setToolCapabilityClassifier(null);
  setToolRequestClient("web_fetch", null);
  resetActionBatcher();
});

describe("action idempotency classification", () => {
  it("classifies HTTP methods deterministically", () => {
    expect(classifyActionIdempotency(get("https://a.test/"))).toBe("cacheable");
    expect(
      classifyActionIdempotency({ type: "http", method: "head", url: "https://a.test/" }),
    ).toBe("cacheable");
    expect(classifyActionIdempotency({ type: "http", method: "OPTIONS", url: "x" })).toBe(
      "cacheable",
    );
    expect(classifyActionIdempotency({ type: "http", method: "PUT", url: "x" })).toBe(
      "window-only",
    );
    expect(classifyActionIdempotency({ type: "http", method: "DELETE", url: "x" })).toBe(
      "window-only",
    );
    expect(classifyActionIdempotency(post("x"))).toBe("never");
    expect(classifyActionIdempotency({ type: "http", method: "PATCH", url: "x" })).toBe("never");
  });

  it("never collapses sends, and treats identical file writes as window-only", () => {
    expect(classifyActionIdempotency({ type: "send", target: "u1", content: "hi" })).toBe("never");
    expect(classifyActionIdempotency({ type: "file-write", path: "/a", content: "b" })).toBe(
      "window-only",
    );
  });

  it("uses the host tool capability map, and fails toward overt without one", () => {
    const tool: EgressAction = { type: "tool", toolName: "web_fetch", params: { url: "u" } };
    expect(classifyActionIdempotency(tool)).toBe("never");
    setToolCapabilityClassifier((name) =>
      name === "web_fetch"
        ? { capability: "net.egress", reversible: true, exemption: "read-only-retrieval" }
        : name === "read"
          ? { capability: "fs.read", reversible: true }
          : { capability: "tool.invoke", reversible: false },
    );
    expect(classifyActionIdempotency(tool)).toBe("cacheable");
    expect(classifyActionIdempotency({ type: "tool", toolName: "read" })).toBe("cacheable");
    expect(classifyActionIdempotency({ type: "tool", toolName: "mystery" })).toBe("never");
    setToolCapabilityClassifier(() => {
      throw new Error("broken");
    });
    expect(classifyActionIdempotency(tool)).toBe("never");
  });

  it("encodes equal effects equally", () => {
    expect(canonicalActionEncoding(get("HTTPS://A.test/x"))).toBe(
      canonicalActionEncoding({ type: "http", method: "get", url: "https://a.test/x" }),
    );
    expect(actionKey({ type: "tool", toolName: "web_search", params: { q: "a", n: 1 } })).toBe(
      actionKey({ type: "tool", toolName: "WEB_SEARCH", params: { n: 1, q: "a" } }),
    );
    expect(actionKey(get("https://a.test/1"))).not.toBe(actionKey(get("https://a.test/2")));
  });
});

describe("action batcher", () => {
  const urls = Array.from({ length: 6 }, (_, i) => `https://h.test/${i}`);

  it("releases a window in canonical hash order regardless of arrival order", async () => {
    const forward = await runWindow(
      manual().batcher,
      urls.map((u, i) => ({ id: `a${i}`, action: get(u) })),
    );
    const reverse = await runWindow(
      manual().batcher,
      urls.toReversed().map((u, i) => ({ id: `a${urls.length - 1 - i}`, action: get(u) })),
    );
    expect(forward.order).toEqual(reverse.order);
    const sorted = urls
      .map((u, i) => ({ id: `a${i}`, key: actionKey(get(u)) }))
      .toSorted((a, b) => (a.key < b.key ? -1 : 1))
      .map((x) => x.id);
    expect(forward.order).toEqual(sorted);
  });

  it("keeps arrival order with canonicalOrder off", async () => {
    const { order } = await runWindow(
      manual({ canonicalOrder: false, collapseIdempotentRepeats: false }).batcher,
      urls.map((u, i) => ({ id: `a${i}`, action: get(u) })),
    );
    expect(order).toEqual(urls.map((_, i) => `a${i}`));
  });

  it("collapses idempotent repeats in a window and hands them the leader's result", async () => {
    const { batcher } = manual();
    const { releases } = await runWindow(batcher, [
      { id: "g1", action: get(urls[0]) },
      { id: "g2", action: get(urls[0]) },
      { id: "p1", action: post(urls[0]) },
      { id: "p2", action: post(urls[0]) },
      { id: "s1", action: { type: "send", target: "u", content: "hi" } },
      { id: "s2", action: { type: "send", target: "u", content: "hi" } },
    ]);
    const byId = Object.fromEntries(
      ["g1", "g2", "p1", "p2", "s1", "s2"].map((id, i) => [id, releases[i]]),
    );
    expect(byId.g1.outcome).toBe("execute");
    expect(byId.g2.outcome).toBe("collapsed");
    for (const id of ["p1", "p2", "s1", "s2"]) {
      expect(byId[id].outcome, id).toBe("execute");
    }
    batcher.complete("g1", { body: "page" });
    await expect(
      (byId.g2 as Extract<ActionRelease, { outcome: "collapsed" }>).response,
    ).resolves.toEqual({ ok: true, response: { body: "page" } });
  });

  it("answers cacheable repeats across windows for the scope's lifetime", async () => {
    const { batcher, advance } = manual({ cacheTtlMs: 1_000 });
    await runWindow(batcher, [{ id: "g1", action: get(urls[0]) }]);
    batcher.complete("g1", "page");
    const hit = await batcher.submit({ id: "g2", action: get(urls[0]), scope: "run-1" });
    expect(hit).toMatchObject({ outcome: "cached", ok: true, response: "page" });
    // C2: time never releases a repeat (the sender could just wait).
    advance(24 * 3_600_000);
    const later = await batcher.submit({ id: "g3", action: get(urls[0]), scope: "run-1" });
    expect(later).toMatchObject({ outcome: "cached", response: "page" });
    // Other scopes (runs) are independent.
    const other = await runWindow(batcher, [{ id: "o1", action: get(urls[0]) }], [], "run-2");
    expect(other.releases[0].outcome).toBe("execute");
  });

  it("does not cache window-only actions (PUT, identical file writes)", async () => {
    const { batcher } = manual();
    const put: EgressAction = { type: "http", method: "PUT", url: urls[0], body: "v" };
    const first = await runWindow(batcher, [
      { id: "u1", action: put },
      { id: "u2", action: put },
      { id: "w1", action: { type: "file-write", path: "/a", content: "x" } },
      { id: "w2", action: { type: "file-write", path: "/a", content: "x" } },
    ]);
    expect(first.releases.map((r) => r.outcome)).toEqual([
      "execute",
      "collapsed",
      "execute",
      "collapsed",
    ]);
    batcher.complete("u1", "ok");
    const again = await runWindow(batcher, [{ id: "u3", action: put }]);
    expect(again.releases[0].outcome).toBe("execute");
  });

  it("sorts and collapses data-flow dependents like any concurrent action", async () => {
    // Regression: a call whose input came from an earlier result (dataFlowFrom)
    // used to be a barrier: never sorted, collapsed or cached. An injected page
    // that names its URLs could thereby turn every fetch into one.
    const { batcher } = manual();
    const items = [
      { id: "d3", action: get(urls[3]), dataFlowFrom: ["page"] },
      { id: "d1", action: get(urls[1]), dataFlowFrom: ["page"] },
      { id: "d1b", action: get(urls[1]), dataFlowFrom: ["page"] },
      { id: "d2", action: get(urls[2]), dataFlowFrom: ["page"] },
    ];
    const forward = await runWindow(batcher, items);
    const reverse = await runWindow(manual().batcher, items.toReversed());
    expect(forward.order).toEqual(
      ["d1", "d2", "d3"].toSorted((a, b) => {
        const k = (id: string) => actionKey(items.find((x) => x.id === id)!.action);
        return k(a) < k(b) ? -1 : 1;
      }),
    );
    expect(new Set(reverse.order.map((id) => id.replace("b", "")))).toEqual(new Set(forward.order));
    expect(forward.releases.map((r) => r.outcome)).toEqual([
      "execute",
      "execute",
      "collapsed",
      "execute",
    ]);
  });

  it("answers a data-flow dependent repeat from the cache", async () => {
    // Regression: web_fetch echoes its URL in its result, so a later fetch of
    // the same URL always looked dependent on the first and bypassed the cache.
    const { batcher } = manual();
    await runWindow(batcher, [{ id: "g1", action: get(urls[0]) }]);
    batcher.complete("g1", "page");
    const hit = await batcher.submit({
      id: "g2",
      action: get(urls[0]),
      scope: "run-1",
      dataFlowFrom: ["g1"],
    });
    expect(hit).toMatchObject({ outcome: "cached", response: "page" });
  });

  it("releases ordering barriers after the window and charges log2(d!) for their order", async () => {
    const ledger = createCapacityLedger({ capacityBits: 100, refillBitsPerSec: 0, now: () => 0 });
    const { batcher, findings } = manual();
    const items = [
      { id: "x3", action: get(urls[3]) },
      { id: "b1", action: get(urls[1]), dependsOn: ["earlier"] },
      { id: "x1", action: get(urls[0]) },
      { id: "b2", action: get(urls[5]), dependsOn: ["earlier"] },
      { id: "b3", action: get(urls[4]), dependsOn: ["earlier"] },
      { id: "x2", action: get(urls[2]) },
    ];
    const order: string[] = [];
    const promises = items.map((item) =>
      batcher.submit({ ...item, scope: "run-1", ledger }).then(async (r) => {
        if (r.outcome === "execute") {
          await requestToolIssueSlot("web_fetch", (item.action as { url: string }).url, item.id);
          order.push(item.id);
        }
        return r;
      }),
    );
    batcher.flush();
    await Promise.all(promises);
    // Independent actions first (sorted), then the barriers in arrival order.
    expect(order.slice(3)).toEqual(["b1", "b2", "b3"]);
    expect(order.slice(0, 3).toSorted()).toEqual(["x1", "x2", "x3"]);
    // M12: which 3 of the 6 are barriers, log2 C(6,3), plus their order, log2 3!.
    expect(ledger.observedTotal()).toBeCloseTo(Math.log2(20) + Math.log2(6), 9);
    expect(findings.filter((f) => f.code === "ordering-barrier")).toHaveLength(3);
  });

  it("hides which independent actions arrived before a barrier (P6b)", async () => {
    // Regression: the release used to split the window around each barrier,
    // so the split itself carried up to m-1 bits the ledger never saw.
    const run = async (arrival: string[]) => {
      const byId: Record<string, { id: string; action: EgressAction; dependsOn?: string[] }> = {
        a: { id: "a", action: get(urls[0]) },
        b: { id: "b", action: get(urls[1]) },
        c: { id: "c", action: get(urls[2]) },
        B: { id: "B", action: get(urls[3]), dependsOn: ["earlier"] },
      };
      return (
        await runWindow(
          manual().batcher,
          arrival.map((id) => byId[id]),
        )
      ).order;
    };
    const first = await run(["a", "b", "B", "c"]);
    expect(await run(["c", "B", "a", "b"])).toEqual(first);
    expect(await run(["B", "a", "b", "c"])).toEqual(first);
  });

  it("blocks an ordering barrier when the capacity ledger is exhausted", async () => {
    const ledger = createCapacityLedger({ capacityBits: 0, refillBitsPerSec: 0, now: () => 0 });
    const { batcher } = manual();
    const opts = { scope: "s", ledger, dependsOn: ["a0"] };
    const p1 = batcher.submit({ id: "b", action: get(urls[1]), ...opts });
    const p2 = batcher.submit({ id: "c", action: get(urls[2]), ...opts });
    batcher.flush();
    // The first barrier's order carries log2(1) = 0 bits; the second does not fit.
    expect((await p1).outcome).toBe("execute");
    expect(await p2).toMatchObject({ outcome: "blocked", reason: "capacity ledger exhausted" });
  });

  it("pads a window to the full allowed set through the tool's own client", async () => {
    const allowedSet = urls.map(get);
    const { batcher, padded } = manual({ padding: { enabled: true, allowedSet } });
    const { releases } = await runWindow(batcher, [
      { id: "a", action: get(urls[4]) },
      { id: "b", action: get(urls[1]) },
    ]);
    expect(releases.map((r) => r.outcome)).toEqual(["execute", "execute"]);
    const observed = new Set([...padded, get(urls[4]), get(urls[1])].map(actionKey));
    expect(observed).toEqual(new Set(allowedSet.map(actionKey)));
    expect(padded).toHaveLength(4);
  });

  it("uses the client the padded tool published when none is injected", async () => {
    const rec = recordingClient();
    setToolRequestClient("web_fetch", rec.client);
    const batcher = track(
      createActionBatcher(
        {
          ...DEFAULT_ACTION_BATCHER_OPTIONS,
          padding: { enabled: true, allowedSet: urls.slice(0, 3).map(get) },
        },
        { setTimer: () => null, clearTimer: () => {}, issuedTimeoutMs: 20 },
      ),
    );
    const p = batcher.submit({ id: "a", action: get(urls[0]), scope: "s" });
    batcher.flush();
    expect((await p).outcome).toBe("execute");
    await requestToolIssueSlot("web_fetch", urls[0], "a");
    await settleDispatch();
    expect(rec.padded.map((a) => (a as { url: string }).url).toSorted()).toEqual(
      urls.slice(1, 3).toSorted(),
    );
  });

  it("dispatches real and padding GETs in one canonical sequence", async () => {
    const allowedSet = urls.map(get);
    const { batcher, wire } = manual({ padding: { enabled: true, allowedSet } });
    // The open core's web_fetch waits for its slot, then leaves.
    await runWindow(
      batcher,
      [
        { id: "a", action: get(urls[4]) },
        { id: "b", action: get(urls[1]) },
      ],
      wire,
    );
    const canonical = urls.toSorted((x, y) => (actionKey(get(x)) < actionKey(get(y)) ? -1 : 1));
    expect(wire).toEqual(canonical);
  });

  it("holds several real GETs to their slots and releases them in canonical order", async () => {
    const { batcher } = manual();
    const wire: string[] = [];
    const items = urls.map((u, i) => ({ id: `a${i}`, action: get(u) }));
    await runWindow(batcher, items.toReversed(), wire);
    expect(wire).toEqual(urls.toSorted((x, y) => (actionKey(get(x)) < actionKey(get(y)) ? -1 : 1)));
  });

  it("sends a released GET itself when the tool never issues it", async () => {
    const allowedSet = urls.slice(0, 2).map(get);
    const { batcher, wire, findings } = manual({ padding: { enabled: true, allowedSet } });
    const p = batcher.submit({ id: "a", action: get(urls[0]), scope: "run-1" });
    batcher.flush();
    expect((await p).outcome).toBe("execute");
    await new Promise((r) => setTimeout(r, 80));
    expect(wire.toSorted()).toEqual(urls.slice(0, 2).toSorted());
    expect(findings.some((f) => f.code === "padding-substitute")).toBe(true);
  });

  it("never pre-checks padding, so a receiver's DNS answer cannot block the window", async () => {
    // Regression (C3): a dummy used to resolve its host once in check() and
    // again when sent, a DNS pattern a real fetch never makes, and a failed
    // check blocked the window. A dummy now takes the real path only.
    let checks = 0;
    const rec = recordingClient();
    const client: ToolRequestClient = {
      check: async () => {
        checks++;
        return { ok: false, reason: "blocked by policy" };
      },
      send: rec.client.send,
    };
    const { batcher } = manual(
      { padding: { enabled: true, allowedSet: urls.slice(0, 3).map(get) } },
      client,
    );
    const { releases } = await runWindow(batcher, [{ id: "a", action: get(urls[0]) }]);
    expect(releases[0].outcome).toBe("execute");
    expect(checks).toBe(0);
    expect(rec.padded).toHaveLength(2);
  });

  it("fails closed with no request client", async () => {
    const batcher = createActionBatcher(
      { ...DEFAULT_ACTION_BATCHER_OPTIONS, padding: { enabled: true, allowedSet: [get(urls[1])] } },
      { setTimer: () => null, clearTimer: () => {}, paddingClient: () => null },
    );
    const p = batcher.submit({ id: "a", action: get(urls[0]), scope: "s" });
    batcher.flush();
    expect(await p).toMatchObject({ outcome: "blocked" });
  });

  it("does not latch padding closed when a dummy fails in flight (no receiver-controlled DoS)", async () => {
    // Regression (C3): a receiver that failed or hung a dummy blocked every
    // later padded window. A dummy fails exactly as a real fetch of the same
    // URL would, so its failure is not a fault.
    const failing: ToolRequestClient = {
      check: async () => ({ ok: true }),
      send: async () => {
        throw new Error("connection refused");
      },
    };
    const { batcher } = manual(
      { padding: { enabled: true, allowedSet: urls.slice(0, 2).map(get) } },
      failing,
    );
    const first = await runWindow(batcher, [{ id: "a", action: get(urls[0]) }]);
    expect(first.releases[0].outcome).toBe("execute");
    expect(batcher.paddingFault()).toBeNull();
    const second = await runWindow(batcher, [{ id: "b", action: get(urls[1]) }]);
    expect(second.releases[0].outcome).toBe("execute");
  });

  it("refuses every invalid or weakening config value instead of clamping it", () => {
    const bad: Array<[string, unknown]> = [
      ["windowMs below 250", { windowMs: 5 }],
      ["windowMs above 10000", { windowMs: 20_000 }],
      ["windowMs not an integer", { windowMs: 300.5 }],
      ["windowMs wrong type", { windowMs: "250" }],
      ["canonicalOrder off", { canonicalOrder: false }],
      ["collapse off", { collapseIdempotentRepeats: false }],
      ["collapse wrong type", { collapseIdempotentRepeats: "yes" }],
      ["cacheTtlMs 0", { cacheTtlMs: 0 }],
      ["cacheTtlMs negative", { cacheTtlMs: -1 }],
      ["cacheTtlMs too large", { cacheTtlMs: 600_001 }],
      [
        "unsafe padding method",
        { padding: { allowedSet: [{ method: "POST", url: "https://b.test/" }] } },
      ],
      [
        "padding entry with unknown key",
        { padding: { allowedSet: [{ url: "https://b.test/", x: 1 }] } },
      ],
      ["padding entry wrong type", { padding: { allowedSet: [3] } }],
      ["padding set not a list", { padding: { allowedSet: "https://a.test/" } }],
      ["padding on with empty set", { padding: { enabled: true, allowedSet: [] } }],
      ["padding unknown key", { padding: { enabled: false, extra: 1 } }],
      ["tools removing a default", { tools: ["web_fetch"] }],
      ["tools empty", { tools: [] }],
      ["unknown key", { refreshIntervalMs: 1_000 }],
    ];
    for (const [name, raw] of bad) {
      expect(() => resolveActionBatcherOptions(raw), name).toThrow(/egress-action-batcher/);
    }
  });

  it("accepts valid values, and tools may only add to the defaults", () => {
    const o = resolveActionBatcherOptions({
      windowMs: 500,
      cacheTtlMs: 1_000,
      padding: { enabled: true, allowedSet: ["https://a.test/", { method: "HEAD", url: "c" }] },
      tools: [...DEFAULT_ACTION_BATCHER_OPTIONS.tools, "my_fetch"],
    });
    expect(o.windowMs).toBe(500);
    expect(o.padding.allowedSet).toEqual([
      { type: "http", method: "GET", url: "https://a.test/" },
      { type: "http", method: "HEAD", url: "c" },
    ]);
    expect(o.tools).toContain("my_fetch");
  });

  it("defaults to canonical order and collapse on, padding off", () => {
    const o = resolveActionBatcherOptions(undefined);
    expect(o.canonicalOrder).toBe(true);
    expect(o.collapseIdempotentRepeats).toBe(true);
    expect(o.padding.enabled).toBe(false);
    expect(o.windowMs).toBe(250);
    expect(o.cacheTtlMs).toBe(30_000);
  });

  it("releases at once in audit mode and reports collapsible repeats", async () => {
    const { batcher, findings } = manual();
    const a = await batcher.submit({ id: "1", action: get(urls[0]), mode: "audit" });
    const b = await batcher.submit({ id: "2", action: get(urls[0]), mode: "audit" });
    expect([a.outcome, b.outcome]).toEqual(["execute", "execute"]);
    expect(batcher.pending()).toBe(0);
    expect(findings.some((f) => f.code === "collapsible-repeat")).toBe(true);
  });

  it("never batches a tool call described only by its parameters (fail closed, audited)", async () => {
    // A `tool` action has no observation: keying it on its parameters would
    // let parameters that never leave the host choose its sort position.
    const { batcher, findings } = manual();
    const tool = (extra: number): EgressAction => ({
      type: "tool",
      toolName: "Web_Search",
      params: { query: "q", localOnly: extra },
    });
    const r = await batcher.submit({ id: "t1", action: tool(1) });
    expect(r).toMatchObject({ outcome: "blocked" });
    expect((r as { reason: string }).reason).toContain("no declared mapping");
    expect(batcher.pending()).toBe(0);
    expect(findings).toContainEqual(
      expect.objectContaining({
        code: "unmapped-tool",
        severity: "high",
        detail: { tool: "web_search" },
      }),
    );
    // Even next to a mapped action in an open window it never joins the window.
    const fetch = batcher.submit({ id: "g1", action: get(urls[0]) });
    expect((await batcher.submit({ id: "t2", action: tool(2) })).outcome).toBe("blocked");
    expect(batcher.pending()).toBe(1);
    batcher.flush();
    expect((await fetch).outcome).toBe("execute");
  });

  it("reports an unmapped tool call in audit mode and releases it", async () => {
    const { batcher, findings } = manual();
    const r = await batcher.submit({
      id: "t1",
      action: { type: "tool", toolName: "browser", params: {} },
      mode: "audit",
    });
    expect(r.outcome).toBe("execute");
    expect(findings).toContainEqual(
      expect.objectContaining({ code: "unmapped-tool", severity: "medium" }),
    );
  });

  it("closes the window on its timer", async () => {
    let fire: (() => void) | null = null;
    const batcher = createActionBatcher(DEFAULT_ACTION_BATCHER_OPTIONS, {
      setTimer: (fn) => {
        fire = fn;
        return 1;
      },
      clearTimer: () => {},
    });
    const p = batcher.submit({ id: "1", action: get(urls[0]) });
    expect(batcher.pending()).toBe(1);
    fire!();
    expect((await p).outcome).toBe("execute");
  });

  it("shares one registered batcher through the global slot", () => {
    const b = manual().batcher;
    const unregister = registerActionBatcher(b);
    expect(getActionBatcher()).toBe(b);
    unregister();
    expect(getActionBatcher()).toBeNull();
  });
});

describe("hypothesis (C): resource equivalence is approximated conservatively", () => {
  const put = (url: string, body = "b"): EgressAction => ({
    type: "http",
    method: "PUT",
    url,
    body,
  });
  const del = (url: string): EgressAction => ({ type: "http", method: "DELETE", url });

  it("two identical PUTs alone collapse", async () => {
    const { batcher } = manual();
    const { releases } = await runWindow(batcher, [
      { id: "a", action: put("https://h.test/r") },
      { id: "b", action: put("https://h.test/r") },
    ]);
    expect(releases.map((r) => r.outcome).toSorted()).toEqual(["collapsed", "execute"]);
  });

  it("any other side-effecting request to the same path (any method, any query) stops collapse", async () => {
    for (const other of [
      del("https://h.test/r"),
      del("https://h.test/r?x=1"),
      put("https://h.test/r?v=2", "c"),
      { type: "http", method: "POST", url: "https://h.test/r", body: "p" } as EgressAction,
    ]) {
      const { batcher } = manual();
      const { releases } = await runWindow(batcher, [
        { id: "a", action: put("https://h.test/r") },
        { id: "b", action: put("https://h.test/r") },
        { id: "c", action: other },
      ]);
      expect(
        releases.map((r) => r.outcome),
        JSON.stringify(other),
      ).toEqual(["execute", "execute", "execute"]);
    }
  });

  it("a side-effecting request to another path of the same origin conflicts too (aliases)", async () => {
    const { releases } = await runWindow(manual().batcher, [
      { id: "a", action: put("https://h.test/v1/item/1") },
      { id: "b", action: put("https://h.test/v1/item/1") },
      { id: "c", action: del("https://h.test/latest/item/1") },
    ]);
    expect(releases.map((r) => r.outcome)).toEqual(["execute", "execute", "execute"]);
  });

  it("a side-effecting request to another origin conflicts too (shared backends)", async () => {
    const { releases } = await runWindow(manual().batcher, [
      { id: "a", action: put("https://h.test/r") },
      { id: "b", action: put("https://h.test/r") },
      { id: "c", action: del("https://other.test/r") },
    ]);
    expect(releases.map((r) => r.outcome)).toEqual(["execute", "execute", "execute"]);
  });

  it("a safe GET, or a file write, leaves HTTP collapse as it was", async () => {
    const { batcher } = manual();
    const { releases } = await runWindow(batcher, [
      { id: "a", action: put("https://h.test/r") },
      { id: "b", action: put("https://h.test/r") },
      { id: "c", action: { type: "file-write", path: "/ws/x", content: "1" } },
      { id: "g1", action: get("https://h.test/r") },
      { id: "g2", action: get("https://h.test/r#f") },
    ]);
    const byId = (id: string) => releases[["a", "b", "c", "g1", "g2"].indexOf(id)].outcome;
    expect([byId("a"), byId("b")].toSorted()).toEqual(["collapsed", "execute"]);
    expect([byId("g1"), byId("g2")].toSorted()).toEqual(["collapsed", "execute"]);
    // Safe GET collapse is unchanged next to conflicting writes.
    const second = await runWindow(manual().batcher, [
      { id: "p", action: put("https://h.test/r") },
      { id: "d", action: del("https://h.test/r") },
      { id: "g1", action: get("https://h.test/r") },
      { id: "g2", action: get("https://h.test/r") },
    ]);
    expect(second.releases.map((r) => r.outcome)).toEqual([
      "execute",
      "execute",
      "execute",
      "collapsed",
    ]);
  });

  it("keys an existing file by its filesystem identity: hard-linked paths are one write", async () => {
    const w = (p: string, content: string, identity?: string): EgressAction => ({
      type: "file-write",
      path: p,
      content,
      ...(identity ? { identity } : {}),
    });
    expect(actionKey(w("/a", "x", "1:2:3"))).toBe(actionKey(w("/b", "x", "1:2:3")));
    expect(actionKey(w("/a", "x"))).not.toBe(actionKey(w("/b", "x")));
    const same = await runWindow(manual().batcher, [
      { id: "a", action: w("/ws/a", "x", "1:2:3") },
      { id: "b", action: w("/ws/link-to-a", "x", "1:2:3") },
    ]);
    expect(same.releases.map((r) => r.outcome).toSorted()).toEqual(["collapsed", "execute"]);
    // Different content through the two names conflicts on the one file.
    const conflict = await runWindow(manual().batcher, [
      { id: "a", action: w("/ws/a", "x", "1:2:3") },
      { id: "b", action: w("/ws/a", "x", "1:2:3") },
      { id: "c", action: w("/ws/link-to-a", "y", "1:2:3") },
    ]);
    expect(conflict.releases.map((r) => r.outcome)).toEqual(["execute", "execute", "execute"]);
  });
});

describe("declared reads, request clients and fallbacks", () => {
  const search = (body: string, extra: Partial<Extract<EgressAction, { type: "http" }>> = {}) =>
    ({
      type: "http",
      method: "POST",
      url: "https://api.search.test/v1",
      body,
      client: "x_search",
      ...extra,
    }) as EgressAction;

  it("a POST is cacheable only when its owner declares it a read", () => {
    expect(classifyActionIdempotency(search("q"))).toBe("never");
    expect(classifyActionIdempotency(search("q", { read: true }))).toBe("cacheable");
  });

  it("a declared read collapses in the window and is answered from its record", async () => {
    const { batcher } = manual();
    const { releases } = await runWindow(batcher, [
      { id: "a", action: search("q", { read: true }) },
      { id: "b", action: search("q", { read: true }) },
    ]);
    expect(releases.map((r) => r.outcome)).toEqual(["execute", "collapsed"]);
    batcher.complete("a", "answer");
    const again = await batcher.submit({
      id: "c",
      action: search("q", { read: true }),
      scope: "run-1",
    });
    expect(again).toMatchObject({ outcome: "cached", response: "answer" });
  });

  it("a declared read writes nothing: it neither clears records nor conflicts", async () => {
    const { batcher } = manual();
    await runWindow(batcher, [{ id: "g", action: get("https://api.search.test/page") }]);
    batcher.complete("g", "page");
    await runWindow(batcher, [{ id: "s", action: search("q", { read: true }) }]);
    const again = await batcher.submit({
      id: "g2",
      action: get("https://api.search.test/page"),
      scope: "run-1",
    });
    expect(again.outcome).toBe("cached");
  });

  it("the client and every fallback request are part of the key; the read flag is not", () => {
    expect(actionKey(search("q", { read: true }))).toBe(actionKey(search("q")));
    expect(actionKey(search("q"))).not.toBe(actionKey(search("q", { client: "web_search:x" })));
    const fb = { method: "GET", url: "https://b.test/s?q=1" };
    expect(actionKey(search("q", { also: [fb] }))).not.toBe(actionKey(search("q")));
    expect(actionKey(search("q", { also: [fb] }))).not.toBe(
      actionKey(search("q", { also: [{ ...fb, url: "https://b.test/s?q=2" }] })),
    );
  });

  it("only web_fetch's own GETs take lockstep issue slots", () => {
    expect(outboundGetUrl(get("https://a.test/x"))).toBe("https://a.test/x");
    expect(
      outboundGetUrl({
        type: "http",
        method: "GET",
        url: "https://a.test/x",
        client: "web_search:b",
      }),
    ).toBeNull();
  });
});
