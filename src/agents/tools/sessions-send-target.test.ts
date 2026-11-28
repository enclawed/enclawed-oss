import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
import { resolveSessionStoreKey } from "../../gateway/session-store-key.js";
import { getGlobalHookRunner } from "../../plugins/hook-runner-global.js";
import { wrapToolWithBeforeToolCallHook } from "../pi-tools.before-tool-call.js";
import { currentToolReplayCall, TOOL_OBSERVATION, type ToolObservation } from "../tool-replay.js";
import type { AnyAgentTool } from "./common.js";
import { __testing as sessionsResolutionTesting } from "./sessions-resolution.js";
import { runSessionsSendA2AFlow } from "./sessions-send-tool.a2a.js";
import { createSessionsSendTool } from "./sessions-send-tool.js";

const callGatewayMock = vi.fn();
vi.mock("../../gateway/call.js", () => ({
  callGateway: (opts: unknown) => callGatewayMock(opts),
}));
vi.mock("./sessions-send-tool.a2a.js", () => ({ runSessionsSendA2AFlow: vi.fn() }));
vi.mock("../../plugins/hook-runner-global.js", async () => {
  const actual = await vi.importActual<typeof import("../../plugins/hook-runner-global.js")>(
    "../../plugins/hook-runner-global.js",
  );
  return { ...actual, getGlobalHookRunner: vi.fn() };
});
// The enclawed gates are out of scope: this checks the declaration plumbing.
vi.mock("../../enclawed/agent-tool-guard.js", () => ({
  checkHardwareRootForToolCall: () => ({ allowed: true }),
  checkAuditLogForToolCall: async () => ({ allowed: true }),
  planIrreversibleToolCall: async () => ({ kind: "proceed" }),
  resolveIrreversibleApproval: () => true,
}));

const OPS = "agent:main:discord:group:ops";
const REQUESTER = "agent:main:discord:group:req";

function config(overrides?: {
  mainKey?: string;
  pingPong?: number;
  a2a?: boolean;
  scope?: "per-sender" | "global";
}): EnclawedConfig {
  return {
    session: {
      mainKey: overrides?.mainKey ?? "main",
      scope: overrides?.scope ?? "per-sender",
      agentToAgent: { maxPingPongTurns: overrides?.pingPong ?? 2 },
    },
    tools: {
      sessions: { visibility: "all" },
      agentToAgent: { enabled: overrides?.a2a ?? true },
    },
  } as EnclawedConfig;
}

type Opts = NonNullable<Parameters<typeof createSessionsSendTool>[0]>;

function makeTool(opts?: Partial<Opts>) {
  return createSessionsSendTool({
    agentSessionKey: REQUESTER,
    agentChannel: "discord",
    config: config(),
    callGateway: ((o: unknown) => callGatewayMock(o)) as Opts["callGateway"],
    ...opts,
  });
}

function observerOf(tool: AnyAgentTool) {
  const observe = (tool as unknown as Record<symbol, unknown>)[TOOL_OBSERVATION];
  expect(observe).toBeTypeOf("function");
  return observe as (p: Record<string, unknown>) => Promise<ToolObservation | null>;
}

const observe = (params: Record<string, unknown>, opts?: Partial<Opts>) =>
  observerOf(makeTool(opts))(params);

function parsed(o: ToolObservation | null) {
  if (!o || o.type !== "send") {
    throw new Error("not a send observation");
  }
  return {
    target: o.target,
    content: JSON.parse(o.content) as {
      request: Record<string, unknown>;
      followUp: { timeoutSeconds: number; maxPingPongTurns: number };
    },
  };
}

beforeEach(() => {
  callGatewayMock.mockReset();
  vi.mocked(runSessionsSendA2AFlow).mockReset();
  callGatewayMock.mockImplementation(async (opts: unknown) => {
    const req = opts as { method?: string; params?: Record<string, unknown> };
    const p = req.params ?? {};
    if (req.method === "sessions.resolve") {
      if (p.label === "ops" || p.key === "sess-1" || p.sessionId === "sess-1") {
        return { key: OPS };
      }
      throw new Error("No session found");
    }
    if (req.method === "agent") {
      return { runId: "run-1", acceptedAt: 1 };
    }
    if (req.method === "agent.wait") {
      return { runId: "run-1", status: "ok" };
    }
    if (req.method === "chat.history") {
      return { messages: [] };
    }
    return {};
  });
  sessionsResolutionTesting.setDepsForTest({
    callGateway: ((o: unknown) => callGatewayMock(o)) as never,
  });
});

describe("sessions_send observation", () => {
  it("gives every naming of one session, and local-only params, one observation", async () => {
    const namings: Array<Record<string, unknown>> = [
      { sessionKey: OPS },
      { sessionKey: `  ${OPS}  ` },
      { label: "ops" },
      { label: " ops ", agentId: "main" },
      { sessionKey: "sess-1" },
      { sessionKey: OPS, unknownLocalParam: 7 },
    ];
    const observed = await Promise.all(namings.map((n) => observe({ ...n, message: "hi" })));
    for (const o of observed) {
      expect(o).toEqual(observed[0]);
    }
    expect(parsed(observed[0]).target).toBe(OPS);
    // The message as delivered (trimmed).
    expect(await observe({ sessionKey: OPS, message: "  hi \n" })).toEqual(observed[0]);
    // `current` is the requester's own session.
    expect(
      await observe({ sessionKey: "current", message: "hi" }, { agentSessionKey: OPS }),
    ).toEqual(await observe({ sessionKey: OPS, message: "hi" }, { agentSessionKey: OPS }));
  });

  it("maps the main aliases to one session", async () => {
    // `main` and the configured main key under global scope (`global`).
    const g = config({ scope: "global" });
    const a = await observe({ sessionKey: "main", message: "hi" }, { config: g });
    expect(a).toEqual(await observe({ sessionKey: "global", message: "hi" }, { config: g }));
    expect(parsed(a).target).toBe("global");
    // The full key names the same session, but the receiver reads a different
    // context line (the target's display name), so the content differs.
    const cfg = config({ mainKey: "work" });
    const alias = parsed(await observe({ sessionKey: "main", message: "hi" }, { config: cfg }));
    const full = parsed(
      await observe({ sessionKey: "agent:main:work", message: "hi" }, { config: cfg }),
    );
    expect(alias.target).toBe("agent:main:work");
    expect(full.target).toBe(alias.target);
    expect(full.content.request.extraSystemPrompt).not.toBe(
      alias.content.request.extraSystemPrompt,
    );
  });

  it("changes with every parameter that changes what is sent", async () => {
    const base = await observe({ sessionKey: OPS, message: "hi" });
    const variants: Array<[Record<string, unknown>, Partial<Opts>?]> = [
      [{ sessionKey: OPS, message: "hello" }],
      [{ sessionKey: "agent:main:discord:group:dev", message: "hi" }],
      [{ sessionKey: OPS, message: "hi", timeoutSeconds: 0 }],
      [{ sessionKey: OPS, message: "hi", timeoutSeconds: 5 }],
      [{ sessionKey: OPS, message: "hi", timeoutSeconds: 120 }],
      [{ sessionKey: OPS, message: "hi" }, { agentSessionKey: "agent:main:discord:group:other" }],
      [{ sessionKey: OPS, message: "hi" }, { agentChannel: "slack" }],
      [{ sessionKey: OPS, message: "hi" }, { config: config({ pingPong: 0 }) }],
    ];
    const seen = new Set([JSON.stringify(base)]);
    for (const [params, opts] of variants) {
      const o = await observe(params, opts);
      expect(seen.has(JSON.stringify(o)), JSON.stringify([params, opts])).toBe(false);
      seen.add(JSON.stringify(o));
    }
    // The timeout as execute normalizes it: floored, at least 0, 30 by default.
    const at = async (t: unknown) =>
      parsed(await observe({ sessionKey: OPS, message: "hi", timeoutSeconds: t })).content.followUp
        .timeoutSeconds;
    expect(await at(5.9)).toBe(5);
    expect(await at(-3)).toBe(0);
    expect(await at(undefined)).toBe(30);
    expect(await at(Number.NaN)).toBe(30);
    expect(await observe({ sessionKey: OPS, message: "hi", timeoutSeconds: 30 })).toEqual(base);
  });

  it.each([0, 2])("matches what execute sends (timeoutSeconds %s)", async (timeoutSeconds) => {
    const tool = makeTool();
    const params = { label: "ops", message: " ping ", timeoutSeconds };
    const declared = parsed(await observerOf(tool)(params));
    callGatewayMock.mockClear();
    await tool.execute("call-1", params, undefined, undefined);
    const agentCalls = callGatewayMock.mock.calls
      .map((c) => c[0] as { method?: string; params?: Record<string, unknown> })
      .filter((c) => c.method === "agent");
    expect(agentCalls).toHaveLength(1);
    const { idempotencyKey, ...sent } = agentCalls[0].params ?? {};
    expect(typeof idempotencyKey).toBe("string");
    expect(declared.content.request).toEqual(JSON.parse(JSON.stringify(sent)));
    expect(declared.target).toBe(
      resolveSessionStoreKey({ cfg: config(), sessionKey: String(sent.sessionKey) }),
    );
    // The follow-up flow runs with the declared timeout and turn bound.
    const flow = vi.mocked(runSessionsSendA2AFlow).mock.calls[0]?.[0];
    expect(flow).toMatchObject({
      targetSessionKey: sent.sessionKey,
      message: "ping",
      maxPingPongTurns: declared.content.followUp.maxPingPongTurns,
      announceTimeoutMs:
        declared.content.followUp.timeoutSeconds === 0
          ? 30_000
          : declared.content.followUp.timeoutSeconds * 1000,
    });
  });

  it("throws where execute fails before sending, and is never null", async () => {
    const failing: Array<[Record<string, unknown>, Partial<Opts>?]> = [
      [{ sessionKey: OPS, label: "ops", message: "hi" }],
      [{ message: "hi" }],
      [{ label: "nope", message: "hi" }],
      [{ sessionKey: OPS }],
      [{ sessionKey: OPS, message: "   " }],
      [{ sessionKey: "agent:other:main", message: "hi" }, { config: config({ a2a: false }) }],
      [{ label: "ops", agentId: "other", message: "hi" }, { config: config({ a2a: false }) }],
    ];
    for (const [params, opts] of failing) {
      const tool = makeTool(opts);
      await expect(observerOf(tool)(params), JSON.stringify(params)).rejects.toThrow();
      callGatewayMock.mockClear();
      const result = await tool.execute("c", params, undefined, undefined).catch(() => null);
      if (result) {
        expect(["error", "forbidden"]).toContain((result.details as { status?: string }).status);
      }
      expect(
        callGatewayMock.mock.calls.some((c) => (c[0] as { method?: string }).method === "agent"),
      ).toBe(false);
    }
  });
});

describe("the tool wrapper carries the sessions_send declaration", () => {
  it("puts it on the call's replay context", async () => {
    let seen: unknown = "unset";
    vi.mocked(getGlobalHookRunner).mockReturnValue({
      hasHooks: (name: string) => name === "before_tool_call",
      runBeforeToolCall: async (event: { params: Record<string, unknown> }) => {
        const declared = currentToolReplayCall()?.observe;
        seen = declared ? await declared(event.params) : undefined;
        return undefined;
      },
    } as never);
    const wrapped = wrapToolWithBeforeToolCallHook(makeTool(), { runId: "r1" });
    const params = { label: "ops", message: "hi", timeoutSeconds: 0 };
    await wrapped.execute("c1", params, undefined, undefined);
    expect(seen).toEqual(await observe(params));
    expect(parsed(seen as ToolObservation).target).toBe(OPS);
  });
});
