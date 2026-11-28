import { beforeEach, describe, expect, it, vi } from "vitest";
import { getGlobalHookRunner } from "../plugins/hook-runner-global.js";
import { wrapToolWithBeforeToolCallHook } from "./pi-tools.before-tool-call.js";
import { currentToolReplayCall, type ToolReplayCall } from "./tool-replay.js";

// The tool wrapper's replay seam: a before_tool_call hook (the egress
// mediator) can ask for a call's outcome to be recorded, or for a recorded
// outcome to be reproduced without running the tool. A reproduced outcome is
// the same result, or the same error thrown, as the original call.

vi.mock("../plugins/hook-runner-global.js", async () => {
  const actual = await vi.importActual<typeof import("../plugins/hook-runner-global.js")>(
    "../plugins/hook-runner-global.js",
  );
  return { ...actual, getGlobalHookRunner: vi.fn() };
});
vi.mock("../enclawed/agent-tool-guard.js", () => ({
  checkHardwareRootForToolCall: () => ({ allowed: true }),
  checkAuditLogForToolCall: async () => ({ allowed: true }),
  planIrreversibleToolCall: async () => ({ kind: "proceed" }),
  resolveIrreversibleApproval: () => true,
}));

describe("tool replay seam", () => {
  let onHook: (call: ToolReplayCall | undefined) => void = () => {};
  beforeEach(() => {
    vi.mocked(getGlobalHookRunner).mockReturnValue({
      hasHooks: (name: string) => name === "before_tool_call",
      runBeforeToolCall: async () => {
        onHook(currentToolReplayCall());
        return undefined;
      },
    } as never);
  });

  function tool(run: () => Promise<unknown>) {
    const execute = vi.fn(async () => run());
    const wrapped = wrapToolWithBeforeToolCallHook(
      { name: "web_search", label: "s", description: "s", parameters: {}, execute } as never,
      { runId: "run-1" },
    );
    return { wrapped, execute };
  }

  it("records the outcome when asked, and reproduces it without executing", async () => {
    const result = { content: [{ type: "text", text: "answer" }], details: { n: 1 } };
    let recorded: ToolReplayCall | undefined;
    onHook = (call) => {
      expect(call?.toolCallId).toBe("c1");
      call!.directive = { kind: "record" };
      recorded = call;
    };
    const first = tool(async () => result);
    expect(await first.wrapped.execute("c1", { q: "x" })).toEqual(result);
    expect(recorded?.executed).toBe(true);
    expect(recorded?.outcome).toEqual({ ok: true, result, wire: undefined });

    onHook = (call) => {
      call!.directive = { kind: "replay", outcome: recorded!.outcome! };
    };
    const repeat = tool(async () => ({ content: [{ type: "text", text: "fresh" }] }));
    expect(await repeat.wrapped.execute("c2", { q: "x" })).toEqual(result);
    expect(repeat.execute).not.toHaveBeenCalled();
  });

  it("reproduces a recorded error by throwing it", async () => {
    const error = new Error("Web fetch failed (404): gone");
    onHook = (call) => {
      call!.directive = { kind: "replay", outcome: { ok: false, error } };
    };
    const t = tool(async () => "never");
    await expect(t.wrapped.execute("c3", {})).rejects.toBe(error);
    expect(t.execute).not.toHaveBeenCalled();
  });

  it("runs the tool normally without a directive", async () => {
    let seen: ToolReplayCall | undefined;
    onHook = (call) => {
      seen = call;
    };
    const t = tool(async () => "ok");
    expect(await t.wrapped.execute("c4", {})).toBe("ok");
    expect(seen?.outcome).toBeUndefined();
    expect(t.execute).toHaveBeenCalledOnce();
  });
});
