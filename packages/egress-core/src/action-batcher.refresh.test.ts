// Agent-independent refresh of recorded outcomes. A repeat is answered from
// the freshest recorded outcome; the batcher itself re-issues each recorded
// request on its own schedule, so an honest agent sees a recovery or a change
// without the agent choosing when anything leaves. The schedule after the
// first release depends only on the batcher's own random stream: two agents
// with different repeat patterns produce byte-identical receiver traces.

import { afterEach, describe, expect, it } from "vitest";
import {
  createActionBatcher,
  DEFAULT_ACTION_BATCHER_OPTIONS,
  REFRESH_DEFAULTS,
  type ActionBatcherOptions,
  type RecordedOutcome,
} from "./action-batcher.js";
import { requestToolIssueSlot, wireRequestUrl, type EgressAction } from "./action.js";
import { createSeededRandomInt } from "./refresh-entropy.js";

const BASE = REFRESH_DEFAULTS.intervalMs;
const get = (url: string): EgressAction => ({ type: "http", method: "GET", url });

const created: Array<{ dispose(): void }> = [];
afterEach(() => {
  for (const b of created.splice(0)) {
    b.dispose();
  }
});

async function turns(n = 40) {
  for (let i = 0; i < n; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

type Server = {
  answer: (url: string, t: number) => { ok: boolean; body: string };
};

/**
 * A batcher on a virtual clock with a simulated receiver. `trace` is what
 * the receiver sees: `t url` per request. `read` plays one agent read
 * end to end (submit, slot, send, record with a refresh function).
 */
function world(
  server: Server,
  opts: {
    seed?: number;
    options?: Partial<ActionBatcherOptions>;
    perInterval?: number;
    draws?: Array<[number, number]>;
  } = {},
) {
  let t = 1_000_000;
  const timers: Array<{ at: number; fn: () => void; id: number }> = [];
  let nextId = 0;
  const trace: string[] = [];
  const seeded = createSeededRandomInt(Buffer.from(`seed-${opts.seed ?? 1}`));
  const batcher = createActionBatcher(
    { ...DEFAULT_ACTION_BATCHER_OPTIONS, ...opts.options },
    {
      now: () => t,
      setTimer: (fn, ms) => {
        const id = ++nextId;
        timers.push({ at: t + ms, fn, id });
        return id;
      },
      clearTimer: (h) => {
        const i = timers.findIndex((x) => x.id === h);
        if (i >= 0) {
          timers.splice(i, 1);
        }
      },
      randomInt: (min, max) => {
        opts.draws?.push([min, max]);
        return seeded(min, max);
      },
      refresh: opts.perInterval ? { perInterval: opts.perInterval } : undefined,
      paddingClient: () => ({
        check: async () => ({ ok: true }),
        send: async (url) => {
          trace.push(`${t} ${wireRequestUrl(url)}`);
        },
      }),
      issuedTimeoutMs: 50,
    },
  );
  created.push(batcher);
  const fetchNow = (url: string): RecordedOutcome => {
    trace.push(`${t} ${wireRequestUrl(url)}`);
    const out = server.answer(wireRequestUrl(url), t);
    return { ok: out.ok, response: out };
  };
  let n = 0;
  const read = async (url: string, scope = "run"): Promise<{ ok: boolean; body: string }> => {
    const id = `r${++n}`;
    const p = batcher.submit({ id, action: get(url), scope });
    batcher.flush(scope);
    const release = await p;
    if (release.outcome === "execute") {
      await requestToolIssueSlot("web_fetch", url, id);
      const out = fetchNow(url);
      const refresh = async () => fetchNow(url);
      if (out.ok) {
        batcher.complete(id, out.response, undefined, refresh);
      } else {
        batcher.fail(id, out.response, undefined, refresh);
      }
      return out.response as { ok: boolean; body: string };
    }
    if (release.outcome === "cached") {
      return release.response as { ok: boolean; body: string };
    }
    throw new Error(`honest read not answered: ${release.outcome}`);
  };
  /** Advance the virtual clock, firing due timers in order. */
  const advance = async (ms: number) => {
    const end = t + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const due = timers[0];
      if (!due || due.at > end) {
        break;
      }
      timers.shift();
      t = due.at;
      due.fn();
      await turns();
    }
    t = end;
    await turns();
  };
  return { batcher, trace, read, advance, now: () => t };
}

describe("refresh: honest reads see recoveries and changes (FP)", () => {
  it("a transient 503 then recovery: the agent's later repeat gets 200", async () => {
    let recovered = false;
    const w = world({
      answer: () => (recovered ? { ok: true, body: "ok" } : { ok: false, body: "503" }),
    });
    expect((await w.read("https://api.test/x")).ok).toBe(false);
    recovered = true;
    // Baseline: an agent retrying after a backoff of one interval sees 200.
    await w.advance(1.5 * BASE);
    expect(await w.read("https://api.test/x")).toEqual({ ok: true, body: "ok" });
  });

  it("a polled page that changes is seen within one interval (at most 1.5 x base)", async () => {
    let version = 1;
    const w = world({ answer: () => ({ ok: true, body: `v${version}` }) });
    expect((await w.read("https://site.test/feed")).body).toBe("v1");
    version = 2;
    await w.advance(1.5 * BASE);
    expect((await w.read("https://site.test/feed")).body).toBe("v2");
  });

  it("a long-running job status page: the agent's poll loop ends with the same outcome", async () => {
    const poll = async (useBatcher: boolean) => {
      const doneAt = 1_000_000 + 4 * BASE;
      const answer = (_url: string, t: number) => ({
        ok: true,
        body: t >= doneAt ? "done" : "running",
      });
      if (!useBatcher) {
        let t = 1_000_000;
        let polls = 0;
        while (answer("", t).body !== "done") {
          t += 2 * BASE;
          polls++;
        }
        return { outcome: "done", polls };
      }
      const w = world({ answer });
      let polls = 0;
      while ((await w.read("https://ci.test/job/7")).body !== "done") {
        await w.advance(2 * BASE);
        polls++;
        if (polls > 50) {
          return { outcome: "never", polls };
        }
      }
      return { outcome: "done", polls };
    };
    const baseline = await poll(false);
    const batched = await poll(true);
    expect(batched.outcome).toBe(baseline.outcome);
    // Polling every 2 x base, at most one extra poll of lag (1.5 x base < 2 x base).
    expect(batched.polls - baseline.polls).toBeLessThanOrEqual(1);
  });

  it("an honest read is never refused or blocked by the refresh budget", async () => {
    const w = world({ answer: (url) => ({ ok: true, body: url }) }, { perInterval: 2 });
    const urls = Array.from({ length: 7 }, (_, i) => `https://site.test/p/${i}`);
    for (const u of urls) {
      await w.read(u);
    }
    for (let round = 0; round < 5; round++) {
      await w.advance(1.5 * BASE);
      for (const u of urls) {
        expect((await w.read(u)).body).toBe(wireRequestUrl(u));
      }
    }
  });
});

describe("refresh: the schedule is independent of the agent (FN)", () => {
  const server: Server = {
    answer: (url, t) => ({ ok: true, body: `${url}@${Math.floor(t / 1000)}` }),
  };

  it("two agents with different repeat patterns produce byte-identical receiver traces", async () => {
    const run = async (pattern: "eager" | "quiet") => {
      const draws: Array<[number, number]> = [];
      const w = world(server, { seed: 7, draws });
      await w.read("https://r.test/x");
      await w.read("https://r.test/y");
      for (let i = 0; i < 12; i++) {
        if (pattern === "eager") {
          // Repeats at varying times, of both URLs, with fragments.
          await w.read(`https://r.test/x#bit-${i}`);
          await w.advance(i % 3 === 0 ? 7_000 : 23_000);
          await w.read("https://r.test/y");
          await w.advance(30_000 - (i % 3 === 0 ? 7_000 : 23_000));
        } else {
          await w.advance(30_000);
        }
      }
      return { trace: w.trace, draws };
    };
    const eager = await run("eager");
    const quiet = await run("quiet");
    expect(eager.trace.length).toBeGreaterThan(4);
    expect(eager.trace).toEqual(quiet.trace);
    expect(eager.draws).toEqual(quiet.draws);
  });

  it("the spacing source only ever sees the internal bounds", async () => {
    const draws: Array<[number, number]> = [];
    const w = world(server, { draws });
    await w.read("https://r.test/secret-path-0110?x=1");
    for (let i = 0; i < 6; i++) {
      await w.read(`https://r.test/secret-path-0110?x=1#${i}`);
      await w.advance(BASE * 1.5);
    }
    const lo = Math.round(BASE * (1 - REFRESH_DEFAULTS.jitter));
    const hi = Math.round(BASE * (1 + REFRESH_DEFAULTS.jitter)) + 1;
    expect(draws.length).toBeGreaterThan(0);
    expect(draws.every(([a, b]) => a === lo && b === hi)).toBe(true);
  });

  it("rounds stay in canonical order and within [0.5, 1.5] x base of each other", async () => {
    const w = world(server, { seed: 3 });
    const urls = ["https://r.test/c", "https://r.test/a", "https://r.test/b"];
    for (const u of urls) {
      await w.read(u);
    }
    const first = w.trace.length;
    await w.advance(10 * BASE);
    const rounds = new Map<string, string[]>();
    for (const line of w.trace.slice(first)) {
      const [t, url] = line.split(" ");
      rounds.set(t, [...(rounds.get(t) ?? []), url]);
    }
    // Each round is one instant (virtual clock), the whole live set, one canonical order.
    const orders = [...rounds.values()].map((r) => r.join(","));
    expect(new Set(orders).size).toBe(1);
    const times = [...rounds.keys()].map(Number);
    for (let i = 1; i < times.length; i++) {
      const gap = times[i] - times[i - 1];
      expect(gap).toBeGreaterThanOrEqual(0.5 * BASE);
      expect(gap).toBeLessThanOrEqual(1.5 * BASE + 1);
    }
  });

  it("under padding, a round shows the whole set whatever the agent fetched", async () => {
    const set = Array.from({ length: 4 }, (_, i) => `https://r.test/item/${i}`);
    const options = { padding: { enabled: true, allowedSet: set.map(get) } };
    const roundsOf = async (first: string) => {
      const w = world(server, { seed: 5, options });
      await w.read(first);
      await turns();
      const start = w.trace.length;
      await w.advance(1.5 * BASE);
      return w.trace.slice(start).map((line) => line.split(" ")[1]);
    };
    const a = await roundsOf(set[1]);
    const b = await roundsOf(set[3]);
    expect(a.toSorted()).toEqual(set.toSorted());
    expect(a).toEqual(b);
  });

  it("a round-robin budget refreshes every live record within ceil(n/K) rounds", async () => {
    const w = world(server, { perInterval: 2, seed: 9 });
    const urls = Array.from({ length: 5 }, (_, i) => `https://r.test/k/${i}`);
    for (const u of urls) {
      await w.read(u);
    }
    const start = w.trace.length;
    await w.advance(3 * 1.5 * BASE);
    const refreshed = new Set(w.trace.slice(start).map((line) => line.split(" ")[1]));
    expect(refreshed).toEqual(new Set(urls.map(wireRequestUrl)));
  });

  it("an unsafe write to the origin clears the record: the next read is a fresh release", async () => {
    let version = 1;
    const w = world({ answer: () => ({ ok: true, body: `v${version}` }) });
    await w.read("https://app.test/doc");
    const put = w.batcher.submit({
      id: "w1",
      action: { type: "http", method: "PUT", url: "https://app.test/doc", body: "2" },
      scope: "run",
    });
    w.batcher.flush("run");
    await put;
    version = 2;
    w.batcher.complete("w1", "ok");
    expect((await w.read("https://app.test/doc")).body).toBe("v2");
  });

  it("the end of the run stops its refreshes", async () => {
    const w = world(server);
    await w.read("https://r.test/x");
    w.batcher.endScope("run");
    const start = w.trace.length;
    await w.advance(5 * BASE);
    expect(w.trace.length).toBe(start);
  });
});
