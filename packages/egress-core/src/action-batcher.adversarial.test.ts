// Attack-side regressions for the action batcher (skeptic review C1-C4, M4,
// M12). Each test drives the attack the review describes and asserts it gets
// nothing: no extra request on the wire, no reopened count, no leak that is
// not charged. The observer's view is `wire`: every request in the order it
// left, real GETs (played as the open core's web_fetch: wait for the issue
// slot, then leave) and padding alike.

import { afterEach, describe, expect, it } from "vitest";
import {
  createActionBatcher,
  DEFAULT_ACTION_BATCHER_OPTIONS,
  outsideSetBits,
  type ActionBatcherOptions,
  type ActionRelease,
} from "./action-batcher.js";
import {
  actionKey,
  requestToolIssueSlot,
  setToolRequestClient,
  wireRequestUrl,
  type EgressAction,
  type ToolRequestClient,
} from "./action.js";
import { createCapacityLedger } from "./ledger.js";
import type { CapacityLedger, Finding } from "./types.js";

const get = (url: string): EgressAction => ({ type: "http", method: "GET", url });
const http = (method: string, url: string, body = ""): EgressAction => ({
  type: "http",
  method,
  url,
  body,
});

// Each batcher listens on the shared issue-slot listener set: dispose them
// after every test so a stale instance cannot answer another test's slot.
const created: Array<{ dispose(): void }> = [];
function track<T extends { dispose(): void }>(batcher: T): T {
  created.push(batcher);
  return batcher;
}

async function turns(n = 60) {
  for (let i = 0; i < n; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

/**
 * A batcher plus a simulated network: `wire` is what the receiver sees.
 * `call` plays one agent tool call end to end (submit, wait for the slot,
 * send, report the outcome), like the mediator plus the real tool.
 */
function harness(
  overrides: Partial<ActionBatcherOptions> = {},
  opts: { ledger?: CapacityLedger } = {},
) {
  let t = 1_000;
  const wire: string[] = [];
  const findings: Finding[] = [];
  const client: ToolRequestClient = {
    check: async () => ({ ok: true }),
    send: async (url) => {
      wire.push(wireRequestUrl(url));
    },
  };
  const batcher = track(
    createActionBatcher(
      { ...DEFAULT_ACTION_BATCHER_OPTIONS, ...overrides },
      {
        now: () => t,
        setTimer: () => null,
        clearTimer: () => {},
        sleep: async (ms) => {
          t += ms;
        },
        paddingClient: () => client,
        issuedTimeoutMs: 50,
        audit: (_scope, f) => findings.push(f),
      },
    ),
  );
  let n = 0;
  /** Server: answers by path; `/err` paths fail. */
  const serve = (action: EgressAction): { ok: boolean; body: string } => {
    const url = action.type === "http" ? action.url : "";
    return url.includes("/err") ? { ok: false, body: "500" } : { ok: true, body: `body of ${url}` };
  };
  const call = async (action: EgressAction, scope = "run"): Promise<ActionRelease> => {
    const id = `c${++n}`;
    const release = await batcher.submit({ id, action, scope, ledger: opts.ledger });
    if (release.outcome === "execute") {
      if (action.type === "http") {
        if (action.method === "GET") {
          await requestToolIssueSlot("web_fetch", action.url, id);
        }
        wire.push(
          `${action.method === "GET" ? "" : `${action.method} `}${wireRequestUrl(action.url)}`,
        );
      }
      const out = serve(action);
      if (out.ok) {
        batcher.complete(id, out.body);
      } else {
        batcher.fail(id, new Error(out.body));
      }
    }
    return release;
  };
  /** Several calls in one window. */
  const window = async (actions: EgressAction[], scope = "run") => {
    const pending = actions.map((a) => call(a, scope));
    await turns(2);
    batcher.flush(scope);
    const releases = await Promise.all(pending);
    await turns();
    return releases;
  };
  return {
    batcher,
    wire,
    findings,
    call,
    window,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

afterEach(() => {
  for (const b of created.splice(0)) {
    b.dispose();
  }
  setToolRequestClient("web_fetch", null);
});

describe("C1: keys are the request on the wire", () => {
  it("reduces a URL to the request line fetch sends", () => {
    const base = wireRequestUrl("http://198.18.0.1:8080/item/1");
    for (const variant of [
      "http://198.18.0.1:8080/item/1#a",
      "http://198.18.0.1:8080/item/1#b",
      "http://198.18.0.1:8080/item/1?",
      "http://198.18.0.1:8080/item/1?#x",
      "HTTP://198.18.0.1:8080/item/1",
      "http://198.18.0.1:8080/./item/../item/1",
      " http://198.18.0.1:8080/item/1 ",
    ]) {
      expect(wireRequestUrl(variant), variant).toBe(base);
      expect(actionKey(get(variant)), variant).toBe(actionKey(get(base)));
    }
    expect(wireRequestUrl("https://a.test:443/x#f")).toBe("https://a.test/x");
    // Requests that differ on the wire never share a key.
    for (const [a, b] of [
      ["https://a.test/a%2fb", "https://a.test/a%2Fb"],
      ["https://a.test/%41", "https://a.test/A"],
      ["https://a.test/x?a=1", "https://a.test/x?a=2"],
      ["https://a.test/x?", "https://a.test/x?="],
      ["https://u@a.test/x", "https://a.test/x"],
    ]) {
      expect(actionKey(get(a)), `${a} vs ${b}`).not.toBe(actionKey(get(b)));
    }
  });

  it("collapses fragment variants: the count does not reach the observer", async () => {
    const h = harness();
    const releases = await h.window([
      get("https://r.test/item/1#a"),
      get("https://r.test/item/1#b"),
      get("https://r.test/item/1#c"),
    ]);
    expect(releases.map((r) => r.outcome)).toEqual(["execute", "collapsed", "collapsed"]);
    expect(h.wire).toEqual(["https://r.test/item/1"]);
    // Across windows too.
    await h.window([get("https://r.test/item/1#d")]);
    expect(h.wire).toEqual(["https://r.test/item/1"]);
  });

  it("fragments cannot choose the release order", async () => {
    const urls = Array.from({ length: 8 }, (_, i) => `https://r.test/item/${i}`);
    const canonical = urls.toSorted((a, b) => (actionKey(get(a)) < actionKey(get(b)) ? -1 : 1));
    for (const suffix of ["", "#x", "#zz", "#grind-17"]) {
      const h = harness();
      await h.window(urls.toReversed().map((u) => get(`${u}${suffix}`)));
      expect(h.wire, suffix).toEqual(canonical);
    }
  });

  it("under padding, a fragment variant of a member is that member: no extra dummy", async () => {
    const set = Array.from({ length: 4 }, (_, i) => `https://r.test/item/${i}`);
    const h = harness({ padding: { enabled: true, allowedSet: set.map(get) } });
    await h.window([get(`${set[1]}#x`), get(`${set[3]}#y`)]);
    // Each member exactly once: the real ones are not repeated by their dummy.
    expect(h.wire.toSorted()).toEqual(set.toSorted());
  });
});

describe("C2: the repeat count cannot be reopened across windows", () => {
  const X = "https://r.test/item/1";

  it("a local file write, a message, an unrelated or a refused tool call does not re-send a recorded GET", async () => {
    const h = harness();
    await h.window([get(X)]);
    for (const noise of [
      { type: "file-write", path: "/tmp/t", content: "1" },
      { type: "send", target: "u1", content: "hello" },
      { type: "tool", toolName: "browser", params: { action: "snapshot" } },
      http("POST", "https://other.test/x", "b"),
    ] as EgressAction[]) {
      await h.window([noise]);
      const again = await h.window([get(X)]);
      expect(again[0].outcome, JSON.stringify(noise)).toBe("cached");
    }
    expect(h.wire.filter((w) => w === X)).toHaveLength(1);
  });

  it("an error answer is the recorded outcome: repeats get it and are not re-sent", async () => {
    const h = harness();
    const E = "https://r.test/err/1";
    const first = await h.window([get(E)]);
    expect(first[0].outcome).toBe("execute");
    for (let i = 0; i < 5; i++) {
      const again = await h.window([get(E)]);
      expect(again[0]).toMatchObject({ outcome: "cached", ok: false });
      expect(((again[0] as { response: unknown }).response as Error).message).toBe("500");
    }
    expect(h.wire.filter((w) => w === E)).toHaveLength(1);
  });

  it("a repeat in a later window while the first is in flight collapses onto it", async () => {
    const h = harness();
    const first = h.batcher.submit({ id: "f1", action: get(X), scope: "run" });
    h.batcher.flush("run");
    expect((await first).outcome).toBe("execute");
    const repeat = await h.batcher.submit({ id: "f2", action: get(X), scope: "run" });
    expect(repeat.outcome).toBe("collapsed");
    h.batcher.complete("f1", "page");
    await expect((repeat as { response: Promise<unknown> }).response).resolves.toEqual({
      ok: true,
      response: "page",
    });
  });

  it("time never re-sends a repeat", async () => {
    const h = harness({ cacheTtlMs: 1 });
    await h.window([get(X)]);
    for (const wait of [1, 30_000, 3_600_000, 7 * 86_400_000]) {
      h.advance(wait);
      expect((await h.window([get(X)]))[0].outcome).toBe("cached");
    }
    expect(h.wire).toEqual([X]);
  });

  it("capacity never re-sends a repeat: a record moved out of memory still answers it", async () => {
    const h = harness();
    const id = "big";
    const p = h.batcher.submit({ id, action: get(X), scope: "run" });
    h.batcher.flush("run");
    await p;
    // 40 MiB + 40 MiB exceeds the 64 MiB per-scope budget: the oldest is spilled.
    h.batcher.complete(id, { body: "x" }, 40 * 1024 * 1024);
    const q = h.batcher.submit({ id: "big2", action: get(`${X}/2`), scope: "run" });
    h.batcher.flush("run");
    await q;
    h.batcher.complete("big2", "y", 40 * 1024 * 1024);
    const repeat = await h.batcher.submit({ id: "r", action: get(X), scope: "run" });
    expect(repeat).toMatchObject({ outcome: "cached", ok: true, response: { body: "x" } });
    expect(
      (await h.batcher.submit({ id: "r2", action: get(`${X}/2`), scope: "run" })).outcome,
    ).toBe("cached");
    expect(h.wire).toEqual([]);
  });

  it("a run whose repeat state was dropped refuses cacheable actions instead of re-sending", async () => {
    const h = harness();
    await h.window([get(X)], "victim");
    // 1024 other live runs push the victim out of the bounded scope table.
    for (let i = 0; i < 1024; i++) {
      void h.batcher.submit({ id: `o${i}`, action: get(`https://o.test/${i}`), scope: `s${i}` });
    }
    const repeat = await h.batcher.submit({ id: "v2", action: get(X), scope: "victim" });
    expect(repeat.outcome).toBe("blocked");
  });

  it("a write to the origin re-opens its GETs (fresh answer), at submit and at completion", async () => {
    const h = harness();
    await h.window([get(X)]);
    await h.window([http("PUT", X, "new")]);
    expect((await h.window([get(X)]))[0].outcome).toBe("execute");
    // A side-effecting send that names the origin may have written it too.
    await h.window([{ type: "send", target: "web", content: `post to ${X}?submit=1` }]);
    expect((await h.window([get(X)]))[0].outcome).toBe("execute");
  });
});

describe("C4: actions outside the padding set are charged and enforced", () => {
  const set = Array.from({ length: 4 }, (_, i) => `https://r.test/item/${i}`);

  it("charges 9 bits per wire byte plus one", () => {
    const action = get("https://r.test/z#frag");
    expect(outsideSetBits(action)).toBe(9 * Buffer.byteLength("GET https://r.test/z") + 1);
  });

  it("pays from the ledger and releases when the budget allows", async () => {
    const ledger = createCapacityLedger({
      capacityBits: 10_000,
      refillBitsPerSec: 0,
      now: () => 0,
    });
    const h = harness({ padding: { enabled: true, allowedSet: set.map(get) } }, { ledger });
    const out = "https://elsewhere.test/secret-0110";
    const releases = await h.window([get(set[0]), get(out)]);
    expect(releases.map((r) => r.outcome)).toEqual(["execute", "execute"]);
    expect(ledger.available()).toBeCloseTo(10_000 - outsideSetBits(get(out)), 9);
  });

  it("holds, then refuses when the ledger cannot pay; members of P are unaffected", async () => {
    const ledger = createCapacityLedger({ capacityBits: 100, refillBitsPerSec: 0, now: () => 0 });
    const h = harness({ padding: { enabled: true, allowedSet: set.map(get) } }, { ledger });
    const releases = await h.window([get(set[2]), get("https://elsewhere.test/secret-0110")]);
    expect(releases[0].outcome).toBe("execute");
    expect(releases[1]).toMatchObject({ outcome: "blocked" });
    expect(h.wire.toSorted()).toEqual(set.toSorted());
    expect(h.findings.some((f) => f.code === "padding-outside-set-over-budget")).toBe(true);
  });

  it("fails closed with no ledger", async () => {
    const h = harness({ padding: { enabled: true, allowedSet: set.map(get) } });
    const releases = await h.window([get("https://elsewhere.test/a")]);
    expect(releases[0].outcome).toBe("blocked");
    expect(h.wire.toSorted()).toEqual(set.toSorted());
  });
});

describe("M4: window-only collapse requires commuting actions", () => {
  it("{PUT x=1, DELETE x, PUT x=1} releases every action", async () => {
    const h = harness();
    const releases = await h.window([
      http("PUT", "https://r.test/x", "1"),
      http("DELETE", "https://r.test/x"),
      http("PUT", "https://r.test/x", "1"),
    ]);
    expect(releases.map((r) => r.outcome)).toEqual(["execute", "execute", "execute"]);
  });

  it("identical PUTs alone still collapse within the window", async () => {
    const h = harness();
    const releases = await h.window([
      http("PUT", "https://r.test/x", "1"),
      http("PUT", "https://r.test/x", "1"),
    ]);
    expect(releases.map((r) => r.outcome)).toEqual(["execute", "collapsed"]);
  });
});

describe("C3: lockstep slots", () => {
  it("a real GET late for its slot is held for the next window's slot, never an error", async () => {
    const set = ["https://r.test/a", "https://r.test/b"];
    const h = harness({ padding: { enabled: true, allowedSet: set.map(get) } });
    const p = h.batcher.submit({ id: "slow", action: get(set[0]), scope: "run" });
    h.batcher.flush("run");
    expect((await p).outcome).toBe("execute");
    await new Promise((r) => setTimeout(r, 80));
    await turns();
    // Window 1: the substitute filled the late GET's slot; each member once.
    expect(h.wire.toSorted()).toEqual(set.toSorted());
    // The tool finally shows up: it waits for the next window, where it takes
    // its key's slot instead of that key's dummy.
    let sent = false;
    const late = requestToolIssueSlot("web_fetch", set[0], "slow").then(() => {
      sent = true;
      h.wire.push(set[0]);
    });
    await turns();
    expect(sent).toBe(false);
    h.batcher.flush("run");
    await late;
    await turns();
    expect(sent).toBe(true);
    // Window 2 shows each member exactly once too.
    expect(h.wire.slice(2).toSorted()).toEqual(set.toSorted());
  });
});
