import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ChannelMessageObservation,
  ChannelOutboundObservedCall,
} from "../../channels/plugins/types.public.js";
import type { EnclawedConfig } from "../../config/config.js";
import { observeMessageAction } from "../../infra/outbound/message-action-observation.js";
import { getGlobalHookRunner } from "../../plugins/hook-runner-global.js";
import { setActivePluginRegistry } from "../../plugins/runtime.js";
import { createOutboundTestPlugin, createTestRegistry } from "../../test-utils/channel-plugins.js";
import { wrapToolWithBeforeToolCallHook } from "../pi-tools.before-tool-call.js";
import { currentToolReplayCall, TOOL_OBSERVATION } from "../tool-replay.js";
import type { AnyAgentTool } from "./common.js";
import { createMessageTool } from "./message-tool.js";

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

type Observe = (params: Record<string, unknown>) => Promise<unknown>;

const sendText = vi.fn(async () => ({ channel: "corechat", messageId: "t1" }));

function observeSend({ kind, ctx }: ChannelOutboundObservedCall): ChannelMessageObservation {
  return { target: ctx.to, content: { op: kind, text: ctx.text } };
}

const cfg = { channels: { corechat: { enabled: true } } } as EnclawedConfig;

function declared(tool: AnyAgentTool): Observe {
  return (tool as unknown as Record<symbol, Observe>)[TOOL_OBSERVATION];
}

describe("message tool observation declaration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "corechat",
          source: "test",
          plugin: createOutboundTestPlugin({
            id: "corechat",
            messaging: { targetResolver: { looksLikeId: () => true } },
            outbound: { deliveryMode: "direct", sendText, observeSend },
          }),
        },
      ]),
    );
  });

  afterEach(() => {
    setActivePluginRegistry(createTestRegistry([]));
  });

  it("declares the run's resolution of the call, enumerably", async () => {
    const tool = createMessageTool({
      config: cfg,
      currentChannelProvider: "corechat",
      currentChannelId: "room1",
    });
    expect(Object.getOwnPropertySymbols(tool)).toContain(TOOL_OBSERVATION);
    expect(Object.getOwnPropertyDescriptor(tool, TOOL_OBSERVATION)?.enumerable).toBe(true);
    const observe = declared(tool);
    const observed = await observe({ action: "send", message: "hi" });
    expect(observed).toEqual(
      await observeMessageAction({
        cfg,
        action: "send",
        params: { channel: "corechat", target: "room1", message: "hi" },
      }),
    );
    expect(observed).not.toBeNull();
    // Reasoning tags never leave (execute strips them), nor do gateway options.
    expect(
      await observe({
        action: "send",
        message: "<think>plan</think>hi",
        timeoutMs: 9,
        target: "room1",
      }),
    ).toEqual(observed);
    expect(await observe({ action: "send", message: "ho" })).not.toEqual(observed);
    // Dry runs send nothing.
    expect(await observe({ action: "send", message: "hi", dryRun: true })).toEqual({
      type: "none",
    });
    expect(sendText).not.toHaveBeenCalled();
  });

  it("declares nothing where execute would refuse before sending", async () => {
    const tool = createMessageTool({ config: cfg, requireExplicitTarget: true });
    expect(await declared(tool)({ action: "send", message: "hi" })).toBeNull();
  });

  it("keeps the declaration through the before-tool-call wrapper", async () => {
    let seen: unknown = "unset";
    vi.mocked(getGlobalHookRunner).mockReturnValue({
      hasHooks: (name: string) => name === "before_tool_call",
      runBeforeToolCall: async (event: { params: Record<string, unknown> }) => {
        const observe = currentToolReplayCall()?.observe;
        seen = observe ? await observe(event.params) : undefined;
        return { block: true, blockReason: "test stops here" };
      },
    } as never);
    const tool = createMessageTool({
      config: cfg,
      currentChannelProvider: "corechat",
      currentChannelId: "room1",
    });
    const wrapped = wrapToolWithBeforeToolCallHook(tool, { runId: "r1" });
    expect(Object.getOwnPropertySymbols(wrapped)).toContain(TOOL_OBSERVATION);
    await wrapped
      .execute("c1", { action: "send", message: "hi" }, undefined, undefined)
      .catch(() => undefined);
    expect(seen).toEqual(await declared(tool)({ action: "send", message: "hi" }));
    expect(seen).not.toBeNull();
    expect(sendText).not.toHaveBeenCalled();
  });
});
