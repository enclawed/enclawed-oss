// A tool call is one send: its string arguments go through the pipeline once,
// so the timing delay applies once and a rate limit counts the call once.

import { registerEgressStage, resetEgressRegistry } from "@enclawed/egress-core";
import { beforeEach, describe, expect, it } from "vitest";
import { createEgressMediator } from "./mediator.js";

type Handler = (event: unknown, ctx: unknown) => Promise<unknown>;

function setup(pluginConfig: Record<string, unknown>) {
  const hooks = new Map<string, Handler>();
  const slept: number[] = [];
  const api = {
    pluginConfig,
    on: (name: string, handler: Handler) => hooks.set(name, handler),
    logger: { warn: () => {}, info: () => {}, error: () => {}, debug: () => {} },
  };
  createEgressMediator(api as never, {
    sleep: async (ms) => {
      slept.push(ms);
    },
  });
  const call = (params: Record<string, unknown>) =>
    hooks.get("before_tool_call")!({ toolName: "message", params }, { toolName: "message" });
  return { slept, call };
}

const manyStrings = { to: "u1", text: "hello", subject: "s", cc: ["a", "b", "c"] };

beforeEach(() => resetEgressRegistry());

describe("egress-mediator: tool calls are mediated per call", () => {
  it("runs each stage once per call and sleeps the delay once", async () => {
    const { slept, call } = setup({
      toolCall: { enabled: true },
      stages: { "egress-timing-scrambler": { mode: "enforce" } },
    });
    let applies = 0;
    registerEgressStage({
      id: "egress-timing-scrambler",
      priority: 48,
      kinds: ["tool-call"],
      apply: () => {
        applies++;
        return { action: "delay", delayMs: 100 };
      },
    });
    await call(manyStrings);
    expect(applies).toBe(1);
    expect(slept).toEqual([100]);
  });

  it("counts a call once toward a per-sink message limit", async () => {
    const { call } = setup({
      toolCall: { enabled: true },
      stages: { "egress-behavioral-invariants": { mode: "enforce" } },
    });
    // A two-message limit: per-string mediation would trip it on the first call.
    let sent = 0;
    registerEgressStage({
      id: "egress-behavioral-invariants",
      priority: 50,
      kinds: ["tool-call"],
      apply: () => (++sent > 2 ? { action: "cancel", reason: "rate" } : { action: "pass" }),
    });
    expect(await call(manyStrings)).toBeUndefined();
    expect(await call(manyStrings)).toBeUndefined();
    expect(await call(manyStrings)).toEqual({ block: true, blockReason: "egress-mediator: rate" });
  });
});
