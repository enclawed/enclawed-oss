// End to end: the real web_fetch tool, wrapped by the real before_tool_call
// wrapper, mediated by the real egress mediator and action batcher, against a
// simulated server. Each honest agent pattern runs once with the batcher and
// once without it; the results the agent sees must be identical (zero false
// positives), while the server sees each idempotent request at most once per
// run (the count channel stays closed).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createActionBatcher,
  createEgressMediator,
  getActionBatcher,
  DEFAULT_ACTION_BATCHER_OPTIONS,
  registerActionBatcher,
  resetActionBatcher,
  resetEgressRegistry,
  resolveEgressMediatorConfig,
  setToolCapabilityClassifier,
} from "../../extensions/egress-mediator/api.js";
import { wrapToolWithBeforeToolCallHook } from "../../src/agents/pi-tools.before-tool-call.js";
import { TOOL_OBSERVATION } from "../../src/agents/tool-replay.js";
import type { AnyAgentTool } from "../../src/agents/tools/common.js";
import { createWebFetchTool } from "../../src/agents/tools/web-tools.js";
import { resolveRequestUrl } from "../../src/plugin-sdk/request-url.js";
import { getGlobalHookRunner } from "../../src/plugins/hook-runner-global.js";
import { withFetchPreconnect } from "../../src/test-utils/fetch-mock.js";

vi.mock("../../src/plugins/hook-runner-global.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/plugins/hook-runner-global.js")>(
    "../../src/plugins/hook-runner-global.js",
  );
  return { ...actual, getGlobalHookRunner: vi.fn() };
});
// The enclawed gates (hardware root, audit log, irreversible approvals) are
// out of scope here: this checks the batcher and replay chain only.
vi.mock("../../src/enclawed/agent-tool-guard.js", () => ({
  checkHardwareRootForToolCall: () => ({ allowed: true }),
  checkAuditLogForToolCall: async () => ({ allowed: true }),
  planIrreversibleToolCall: async () => ({ kind: "proceed" }),
  resolveIrreversibleApproval: () => true,
}));

type Handler = (event: unknown, ctx: unknown) => unknown;

/** A stateful origin: GET reads; the browser tool's form POST writes. */
function createServer() {
  const pages = new Map<string, string>();
  const hits: string[] = [];
  let flakyLeft = 0;
  const fetchMock = withFetchPreconnect(
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      // What goes on the wire: fetch never sends the fragment.
      const url = resolveRequestUrl(input).replace(/#.*$/, "");
      const method = init?.method ?? "GET";
      hits.push(`${method} ${url}`);
      const path = new URL(url).pathname;
      if (path.startsWith("/missing")) {
        return new Response("no such page", {
          status: 404,
          headers: { "content-type": "text/plain" },
        });
      }
      if (path.startsWith("/flaky") && flakyLeft > 0) {
        flakyLeft--;
        return new Response("busy", { status: 503, headers: { "content-type": "text/plain" } });
      }
      if (path.startsWith("/big")) {
        return new Response("b".repeat(2_000_000), { headers: { "content-type": "text/plain" } });
      }
      const body = pages.get(path) ?? `page ${path} ${new URL(url).search}`;
      return new Response(body, { headers: { "content-type": "text/plain" } });
    }),
  );
  return {
    hits,
    fetchMock,
    write(path: string, body: string) {
      pages.set(path, body);
    },
    flaky(times: number) {
      flakyLeft = times;
    },
  };
}

type Call =
  | { tool: "web_fetch" | "browser"; args: Record<string, unknown> }
  /** The batcher's own refresh round fires (no-op without a batcher). */
  | { tool: "refresh-round" }
  /** The server changes on its own. */
  | { tool: "server"; run: (server: ReturnType<typeof createServer>) => void };

async function runAgent(
  turns: Call[][],
  withBatcher: boolean,
  setup: (server: ReturnType<typeof createServer>) => void = () => {},
) {
  const server = createServer();
  setup(server);
  global.fetch = server.fetchMock;
  const hooks = new Map<string, Handler>();
  const api = {
    pluginConfig: {},
    on: (name: string, handler: Handler) => hooks.set(name, handler),
    logger: { warn: () => {}, info: () => {}, error: () => {}, debug: () => {} },
  };
  resetActionBatcher();
  if (withBatcher) {
    registerActionBatcher(
      createActionBatcher(
        { ...DEFAULT_ACTION_BATCHER_OPTIONS, windowMs: 10 },
        { issuedTimeoutMs: 500 },
      ),
    );
  }
  setToolCapabilityClassifier((name) =>
    name === "web_fetch"
      ? { capability: "net.egress", reversible: true, exemption: "read-only-retrieval" }
      : { capability: "tool.invoke", reversible: false },
  );
  createEgressMediator(api as never, { config: resolveEgressMediatorConfig({}, {}) });
  vi.mocked(getGlobalHookRunner).mockReturnValue({
    hasHooks: (name: string) => name === "before_tool_call",
    runBeforeToolCall: (event: unknown, ctx: unknown) => hooks.get("before_tool_call")!(event, ctx),
  } as never);

  const ctx = { agentId: "main", sessionKey: "main", runId: "run-1" };
  const webFetch = wrapToolWithBeforeToolCallHook(
    createWebFetchTool({
      config: { tools: { web: { fetch: { cacheTtlMinutes: 0 } } } },
      lookupFn: (async () => [{ address: "93.184.216.34", family: 4 }]) as never,
    }) as AnyAgentTool,
    ctx,
  );
  // A side-effecting tool (under the batched name `browser`): it submits a
  // form on the page it names, changing what the page returns. It declares
  // the request it sends, a POST of the value to that page; a batched tool
  // without such a declaration is refused (`TOOL_OBSERVATION`).
  const browser = wrapToolWithBeforeToolCallHook(
    {
      name: "browser",
      label: "Browser",
      description: "submit a form",
      parameters: {},
      execute: async (_id: string, args: Record<string, unknown>) => {
        const url = new URL(String(args.url));
        server.write(url.pathname, String(args.value));
        return { content: [{ type: "text", text: "submitted" }], details: {} };
      },
      [TOOL_OBSERVATION]: (args: Record<string, unknown>) => ({
        type: "http",
        method: "POST",
        url: String(args.url),
        body: String(args.value),
      }),
    } as unknown as AnyAgentTool,
    ctx,
  );

  let n = 0;
  const seen: unknown[] = [];
  for (const turn of turns) {
    const control = turn.filter((c) => c.tool === "refresh-round" || c.tool === "server");
    if (control.length > 0) {
      for (const c of control) {
        if (c.tool === "server") {
          c.run(server);
        } else if (withBatcher) {
          await getActionBatcher()?.refreshTick();
          // Let the re-issued calls complete.
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
      }
      continue;
    }
    const outs = await Promise.all(
      (turn as Array<Extract<Call, { args: unknown }>>).map(async (c) => {
        const id = `call-${++n}`;
        const tool = c.tool === "web_fetch" ? webFetch : browser;
        let out: unknown;
        try {
          const result = (await tool.execute(id, c.args)) as { details?: Record<string, unknown> };
          const { fetchedAt: _f, tookMs: _t, ...stable } = result.details ?? {};
          out = { ok: true, details: stable };
          await hooks.get("after_tool_call")?.(
            { toolName: c.tool, params: c.args, toolCallId: id, result },
            { toolName: c.tool, toolCallId: id, runId: ctx.runId },
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          out = { ok: false, error: message };
          await hooks.get("after_tool_call")?.(
            { toolName: c.tool, params: c.args, toolCallId: id, error: message },
            { toolName: c.tool, toolCallId: id, runId: ctx.runId },
          );
        }
        return out;
      }),
    );
    seen.push(...outs);
  }
  resetActionBatcher();
  // Wrapped error text carries a random boundary id: compare it without that.
  const stable = JSON.parse(
    JSON.stringify(seen).replace(/id=\\"[a-f0-9]{1,16}/g, 'id=\\"X'),
  ) as unknown[];
  return { results: stable, hits: server.hits };
}

const fetch_ = (url: string, extra: Record<string, unknown> = {}): Call => ({
  tool: "web_fetch",
  args: { url, ...extra },
});

const PATTERNS: Array<{
  name: string;
  turns: Call[][];
  maxGetsPerUrl?: number;
  setup?: (server: ReturnType<typeof createServer>) => void;
}> = [
  {
    name: "a transient 503 then recovery: the later retry gets 200",
    setup: (server) => server.flaky(1),
    turns: [
      [fetch_("https://site.test/flaky/1")],
      [{ tool: "refresh-round" }],
      [fetch_("https://site.test/flaky/1")],
    ],
  },
  {
    name: "a polled page that changes is seen after the next refresh round",
    turns: [
      [fetch_("https://site.test/status")],
      [{ tool: "server", run: (server) => server.write("/status", "job done") }],
      [{ tool: "refresh-round" }],
      [fetch_("https://site.test/status")],
      [fetch_("https://site.test/status", { extractMode: "text", maxChars: 200 })],
    ],
  },
  {
    name: "distinct pages, in one turn and one per turn",
    turns: [
      [fetch_("https://site.test/a"), fetch_("https://site.test/b"), fetch_("https://site.test/c")],
      [fetch_("https://site.test/d")],
      [fetch_("https://site.test/e")],
    ],
    maxGetsPerUrl: 1,
  },
  {
    name: "re-fetch to confirm, with other shaping parameters and a fragment",
    turns: [
      [fetch_("https://site.test/doc")],
      [fetch_("https://site.test/doc")],
      [fetch_("https://site.test/doc#part-2", { extractMode: "text", maxChars: 120 })],
      [fetch_("https://site.test/doc", { maxChars: 5_000 })],
    ],
    maxGetsPerUrl: 1,
  },
  {
    name: "fetch, write, re-fetch sees the new state",
    turns: [
      [fetch_("https://app.test/form")],
      [{ tool: "browser", args: { url: "https://app.test/form", value: "saved v2" } }],
      [fetch_("https://app.test/form")],
      [fetch_("https://app.test/form")],
    ],
  },
  {
    name: "paging through a list",
    turns: Array.from({ length: 6 }, (_, i) => [fetch_(`https://api.test/list?page=${i + 1}`)]),
    maxGetsPerUrl: 1,
  },
  {
    name: "a persistent error retried across windows",
    turns: [
      [fetch_("https://site.test/missing/1")],
      [fetch_("https://site.test/missing/1")],
      [fetch_("https://site.test/missing/1")],
    ],
    maxGetsPerUrl: 1,
  },
  {
    name: "a large body, fetched and re-fetched",
    turns: [
      [fetch_("https://site.test/big")],
      [fetch_("https://site.test/big", { maxChars: 50_000 })],
      [fetch_("https://site.test/big")],
    ],
    maxGetsPerUrl: 1,
  },
];

describe("action batcher end to end: honest results unchanged, repeats not re-sent", () => {
  const priorFetch = global.fetch;
  beforeEach(() => resetEgressRegistry());
  afterEach(() => {
    global.fetch = priorFetch;
    resetActionBatcher();
    setToolCapabilityClassifier(null);
    resetEgressRegistry();
  });

  let actions = 0;
  let fp = 0;
  for (const pattern of PATTERNS) {
    it(pattern.name, async () => {
      const without = await runAgent(pattern.turns, false, pattern.setup);
      const withB = await runAgent(pattern.turns, true, pattern.setup);
      actions += withB.results.length;
      fp += withB.results.filter(
        (r, i) => JSON.stringify(r) !== JSON.stringify(without.results[i]),
      ).length;
      expect(withB.results).toEqual(without.results);
      if (pattern.maxGetsPerUrl !== undefined) {
        const counts = new Map<string, number>();
        for (const hit of withB.hits) {
          counts.set(hit, (counts.get(hit) ?? 0) + 1);
        }
        expect(Math.max(...counts.values())).toBeLessThanOrEqual(pattern.maxGetsPerUrl);
      }
    });
  }

  it("reports FP = 0 over every honest pattern", () => {
    expect(actions).toBeGreaterThan(20);
    expect(fp).toBe(0);
  });

  it("an injected agent repeating a fetch (fragments, waits, interleaved writes) sends it once", async () => {
    const X = "https://receiver.test/item/1";
    const turns: Call[][] = [];
    for (let i = 0; i < 6; i++) {
      turns.push([fetch_(`${X}#bit-${i}`)]);
      turns.push([{ tool: "browser", args: { url: "https://unrelated.test/", value: "x" } }]);
    }
    const run = await runAgent(turns, true);
    expect(run.hits.filter((h) => h === `GET ${X}`)).toHaveLength(1);
  });
});
