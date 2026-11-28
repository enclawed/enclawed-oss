// The message-tool send runs the outbound sending hooks exactly once, whether
// the channel plugin handles the send or the core send path does.

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  messageSending: null as null | ((event: { content: string }) => unknown),
  hookCalls: 0,
  pluginHandles: false,
  pluginSaw: [] as Array<{ message: unknown; mediated: boolean }>,
  coreSaw: [] as Array<{ content: unknown; mediated: boolean }>,
}));

vi.mock("../../plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => ({
    hasHooks: (name: string) => name === "message_sending" && state.messageSending !== null,
    runMessageSending: async (event: { content: string }) => {
      state.hookCalls += 1;
      return state.messageSending?.(event);
    },
    runMediaSending: async () => undefined,
  }),
}));

vi.mock("../../channels/plugins/message-action-dispatch.js", async () => {
  const { isOutboundSendMediated } = await import("./sending-scope.js");
  return {
    dispatchChannelMessageAction: async (ctx: { params: Record<string, unknown> }) => {
      state.pluginSaw.push({ message: ctx.params.message, mediated: isOutboundSendMediated() });
      return state.pluginHandles ? { content: [], details: { ok: true } } : null;
    },
  };
});

vi.mock("./message.js", async () => {
  const { isOutboundSendMediated } = await import("./sending-scope.js");
  return {
    sendMessage: async (params: { content: string; channel?: string; to: string }) => {
      state.coreSaw.push({ content: params.content, mediated: isOutboundSendMediated() });
      return { channel: params.channel ?? "x", to: params.to, via: "direct", mediaUrl: null };
    },
    sendPoll: async () => ({}),
  };
});

const { executeSendAction } = await import("./outbound-send-service.js");

const send = () =>
  executeSendAction({
    ctx: {
      cfg: {},
      channel: "slack",
      params: { to: "C1", message: "hello" },
      dryRun: false,
    },
    to: "C1",
    message: "hello",
  });

describe("executeSendAction outbound sending hooks", () => {
  beforeEach(() => {
    state.messageSending = (event) => ({ content: `[m] ${event.content}` });
    state.hookCalls = 0;
    state.pluginHandles = false;
    state.pluginSaw = [];
    state.coreSaw = [];
  });

  it("mediates a plugin-handled send once, before the plugin sees it", async () => {
    state.pluginHandles = true;
    const result = await send();
    expect(result.handledBy).toBe("plugin");
    expect(state.hookCalls).toBe(1);
    expect(state.pluginSaw).toEqual([{ message: "[m] hello", mediated: true }]);
    expect(state.coreSaw).toEqual([]);
  });

  it("mediates a core-path send once (the core path runs in the mediated scope)", async () => {
    const result = await send();
    expect(result.handledBy).toBe("core");
    expect(state.hookCalls).toBe(1);
    expect(state.coreSaw).toEqual([{ content: "[m] hello", mediated: true }]);
  });

  it("refuses the send when a hook cancels it", async () => {
    state.messageSending = () => ({ cancel: true });
    await expect(send()).rejects.toThrow(/blocked by an outbound sending hook/);
    expect(state.pluginSaw).toEqual([]);
    expect(state.coreSaw).toEqual([]);
  });

  it("is a pass-through with no sending hook", async () => {
    state.messageSending = null;
    await send();
    expect(state.hookCalls).toBe(0);
    expect(state.coreSaw).toEqual([{ content: "hello", mediated: false }]);
  });
});
