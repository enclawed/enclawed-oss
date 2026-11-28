// False-positive suite for the action batcher: legitimate agent action
// patterns, run once through the batcher and once without it against the
// same stateful server. Requirement: every legitimate action is released
// (nothing blocked), and every honest result is the result the agent gets
// without the batcher. Two patterns cannot meet both requirements at once
// with zero false negatives; they are asserted explicitly at the end, as the
// documented trade-off, not hidden.

import { describe, expect, it } from "vitest";
import {
  createActionBatcher,
  DEFAULT_ACTION_BATCHER_OPTIONS,
  type ActionBatcherOptions,
} from "./action-batcher.js";
import {
  requestToolIssueSlot,
  wireRequestUrl,
  type EgressAction,
  type ToolRequestClient,
} from "./action.js";
import { createCapacityLedger } from "./ledger.js";

type Result = { ok: boolean; body: string };

/** A stateful HTTP server: GET reads, PUT/POST/DELETE write, some paths fail. */
function createServer() {
  const store = new Map<string, string>();
  const hits: string[] = [];
  let posts = 0;
  const flaky = new Map<string, number>();
  return {
    hits,
    seed(url: string, body: string) {
      store.set(wireRequestUrl(url), body);
    },
    failNext(url: string, times: number) {
      flaky.set(wireRequestUrl(url), times);
    },
    handle(action: EgressAction): Result {
      if (action.type !== "http") {
        return { ok: true, body: `done ${action.type}` };
      }
      const url = wireRequestUrl(action.url);
      hits.push(`${action.method} ${url}`);
      const remaining = flaky.get(url) ?? 0;
      if (remaining > 0) {
        flaky.set(url, remaining - 1);
        return { ok: false, body: "503 Service Unavailable" };
      }
      if (url.includes("/missing")) {
        return { ok: false, body: "404 Not Found" };
      }
      switch (action.method) {
        case "GET":
          return { ok: true, body: store.get(url) ?? `default ${url}` };
        case "PUT":
          store.set(url, action.body ?? "");
          return { ok: true, body: "updated" };
        case "DELETE":
          store.delete(url);
          return { ok: true, body: "deleted" };
        case "POST":
          posts++;
          store.set(url, `${store.get(url) ?? ""}+${action.body ?? ""}`);
          return { ok: true, body: `created #${posts}` };
        default:
          return { ok: false, body: "405" };
      }
    },
  };
}

type Step = { parallel: EgressAction[] } | { advanceMs: number };

/** Run a script of steps; each `parallel` step is one model turn's tool calls. */
async function runScript(
  script: Step[],
  opts: { batcher: boolean; options?: Partial<ActionBatcherOptions> },
) {
  const server = createServer();
  server.seed("https://app.test/doc", "v1");
  let t = 1_000;
  const client: ToolRequestClient = {
    check: async () => ({ ok: true }),
    send: async (url) => {
      server.handle({ type: "http", method: "GET", url });
    },
  };
  const batcher = opts.batcher
    ? createActionBatcher(
        { ...DEFAULT_ACTION_BATCHER_OPTIONS, ...opts.options },
        {
          now: () => t,
          setTimer: () => null,
          clearTimer: () => {},
          sleep: async (ms) => {
            t += ms;
          },
          paddingClient: () => client,
          issuedTimeoutMs: 50,
        },
      )
    : null;
  const ledger = createCapacityLedger({ capacityBits: 4096, refillBitsPerSec: 256, now: () => t });
  const results: Result[] = [];
  let blocked = 0;
  let n = 0;
  for (const step of script) {
    if ("advanceMs" in step) {
      t += step.advanceMs;
      continue;
    }
    const pending = step.parallel.map(async (action): Promise<Result> => {
      if (!batcher) {
        return server.handle(action);
      }
      const id = `c${++n}`;
      const release = await batcher.submit({ id, action, scope: "run", ledger });
      switch (release.outcome) {
        case "execute": {
          if (action.type === "http" && action.method === "GET") {
            await requestToolIssueSlot("web_fetch", action.url, id);
          }
          const out = server.handle(action);
          if (out.ok) {
            batcher.complete(id, out);
          } else {
            batcher.fail(id, out);
          }
          return out;
        }
        case "cached":
          return release.response as Result;
        case "collapsed": {
          const r = await release.response;
          return (r?.response as Result | undefined) ?? { ok: false, body: "lost" };
        }
        case "blocked":
          blocked++;
          return { ok: false, body: `BLOCKED ${release.reason}` };
      }
      return { ok: false, body: "?" };
    });
    await Promise.resolve();
    batcher?.flush("run");
    results.push(...(await Promise.all(pending)));
    for (let i = 0; i < 40; i++) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }
  batcher?.dispose();
  return { results, blocked, hits: server.hits };
}

const get = (url: string): EgressAction => ({ type: "http", method: "GET", url });
const http = (method: string, url: string, body = ""): EgressAction => ({
  type: "http",
  method,
  url,
  body,
});

/** Every honest pattern; `fp` counts results that differ from no-batcher, plus refusals. */
const PATTERNS: Array<{ name: string; script: Step[] }> = [
  {
    name: "fetching distinct pages (one turn, and one per turn)",
    script: [
      { parallel: Array.from({ length: 6 }, (_, i) => get(`https://site.test/p/${i}`)) },
      ...Array.from({ length: 6 }, (_, i) => ({ parallel: [get(`https://site.test/q/${i}`)] })),
    ],
  },
  {
    name: "re-fetching the same page to confirm",
    script: [
      { parallel: [get("https://app.test/doc")] },
      { parallel: [get("https://app.test/doc")] },
      { advanceMs: 60_000 },
      { parallel: [get("https://app.test/doc#section-2"), get("https://app.test/doc")] },
    ],
  },
  {
    name: "fetch, write, re-fetch sees the new state",
    script: [
      { parallel: [get("https://app.test/doc")] },
      { parallel: [http("PUT", "https://app.test/doc", "v2")] },
      { parallel: [get("https://app.test/doc")] },
      { parallel: [http("POST", "https://app.test/doc", "c")] },
      { parallel: [get("https://app.test/doc")] },
      { parallel: [http("DELETE", "https://app.test/doc")] },
      { parallel: [get("https://app.test/doc")] },
    ],
  },
  {
    name: "POST and PUT sequences pass every repeat",
    script: [
      { parallel: [http("POST", "https://api.test/items", "a")] },
      { parallel: [http("POST", "https://api.test/items", "a")] },
      {
        parallel: [
          http("POST", "https://api.test/items", "a"),
          http("POST", "https://api.test/items", "a"),
        ],
      },
      { parallel: [http("PUT", "https://api.test/items/1", "x")] },
      { parallel: [http("PUT", "https://api.test/items/1", "x")] },
      { parallel: [get("https://api.test/items")] },
    ],
  },
  {
    name: "paging through a list",
    script: Array.from({ length: 8 }, (_, i) => ({
      parallel: [get(`https://api.test/list?page=${i + 1}&per_page=20`)],
    })),
  },
  {
    name: "persistent error retried across windows",
    script: [
      { parallel: [get("https://site.test/missing/1")] },
      { advanceMs: 5_000 },
      { parallel: [get("https://site.test/missing/1")] },
      { advanceMs: 30_000 },
      { parallel: [get("https://site.test/missing/1")] },
    ],
  },
  {
    name: "large bodies",
    script: [
      { parallel: [http("PUT", "https://big.test/blob", "x".repeat(5_000_000))] },
      { parallel: [get("https://big.test/blob")] },
      { parallel: [get("https://big.test/blob")] },
    ],
  },
];

describe("honest agent patterns through the batcher (false positives)", () => {
  let totalActions = 0;
  let totalFp = 0;

  for (const pattern of PATTERNS) {
    it(pattern.name, async () => {
      const without = await runScript(pattern.script, { batcher: false });
      const withB = await runScript(pattern.script, { batcher: true });
      const changed = withB.results.filter(
        (r, i) => r.ok !== without.results[i].ok || r.body !== without.results[i].body,
      ).length;
      totalActions += withB.results.length;
      totalFp += changed + withB.blocked;
      expect(withB.blocked, "legitimate actions refused").toBe(0);
      expect(withB.results, "honest results").toEqual(without.results);
      // Every side-effecting request reached the server as often as without the batcher.
      const writes = (hits: string[]) => hits.filter((h) => !h.startsWith("GET ")).toSorted();
      expect(writes(withB.hits)).toEqual(writes(without.hits));
    });
  }

  it("reports FP = 0 over every honest pattern", () => {
    expect(totalActions).toBeGreaterThan(40);
    expect(totalFp).toBe(0);
  });

  it("padded mode with the default ledger: in-set honest fetches are never refused", async () => {
    const set = Array.from({ length: 8 }, (_, i) => `https://site.test/p/${i}`);
    const script: Step[] = Array.from({ length: 20 }, (_, i) => ({
      parallel: [get(set[i % 8]), get(set[(i * 3) % 8])],
    }));
    const options = { padding: { enabled: true, allowedSet: set.map(get) } };
    const without = await runScript(script, { batcher: false });
    const withB = await runScript(script, { batcher: true, options });
    expect(withB.blocked).toBe(0);
    expect(withB.results).toEqual(without.results);
  });
});

describe("formerly trade-offs, now FP = 0 through the batcher's own refresh", () => {
  // The batcher re-issues each recorded request on its own schedule (here one
  // round is run explicitly between the agent's reads), so a repeat after a
  // round sees the server's current answer.
  const runReads = async (
    useBatcher: boolean,
    url: string,
    server: ReturnType<typeof createServer>,
    reads: number,
    between: () => void = () => {},
  ) => {
    const batcher = useBatcher
      ? createActionBatcher(DEFAULT_ACTION_BATCHER_OPTIONS, {
          setTimer: () => null,
          clearTimer: () => {},
          randomInt: (min) => min,
        })
      : null;
    const out: Result[] = [];
    for (let i = 0; i < reads; i++) {
      if (i > 0) {
        between();
        await batcher?.refreshTick();
        await new Promise((r) => setTimeout(r, 1));
      }
      if (!batcher) {
        out.push(server.handle(get(url)));
        continue;
      }
      const p = batcher.submit({ id: `t${i}`, action: get(url), scope: "run" });
      batcher.flush("run");
      const release = await p;
      if (release.outcome === "execute") {
        const r = server.handle(get(url));
        const refresh = async () => {
          const again = server.handle(get(url));
          return { ok: again.ok, response: again };
        };
        if (r.ok) {
          batcher.complete(`t${i}`, r, undefined, refresh);
        } else {
          batcher.fail(`t${i}`, r, undefined, refresh);
        }
        out.push(r);
      } else if (release.outcome === "cached") {
        out.push(release.response as Result);
      } else {
        out.push({ ok: false, body: `refused: ${release.outcome}` });
      }
    }
    batcher?.dispose();
    return out;
  };

  it("a transient error retried after a refresh round sees the recovery", async () => {
    const make = () => {
      const server = createServer();
      server.failNext("https://flaky.test/x", 1);
      return server;
    };
    const baseline = await runReads(false, "https://flaky.test/x", make(), 2);
    const batched = await runReads(true, "https://flaky.test/x", make(), 2);
    expect(baseline.map((r) => r.ok)).toEqual([false, true]);
    expect(batched).toEqual(baseline);
  });

  it("a polled page that changes is seen after the next round; the task outcome is unchanged", async () => {
    const make = () => {
      const server = createServer();
      server.seed("https://ci.test/status", "running");
      return server;
    };
    let polls = 0;
    const flip = (server: ReturnType<typeof createServer>) => () => {
      polls++;
      if (polls === 3) {
        server.seed("https://ci.test/status", "done");
      }
    };
    const s1 = make();
    const baseline = await runReads(false, "https://ci.test/status", s1, 5, flip(s1));
    polls = 0;
    const s2 = make();
    const batched = await runReads(true, "https://ci.test/status", s2, 5, flip(s2));
    expect(batched).toEqual(baseline);
    expect(batched.at(-1)?.body).toBe("done");
  });
});
