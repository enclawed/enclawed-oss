// Spoken call text runs message_sending before it is played: a rewrite is
// what the callee hears, a cancel plays nothing.

import {
  addTestHook,
  createEmptyPluginRegistry,
  initializeGlobalHookRunner,
  resetGlobalHookRunner,
  type PluginHookRegistration,
} from "@enclawed/plugin-sdk/channel-test-helpers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./state.js", () => ({ addTranscriptEntry: vi.fn(), transitionState: vi.fn() }));
vi.mock("./store.js", () => ({ persistCallRecord: vi.fn() }));

import { speak } from "./outbound.js";

function createCtx() {
  const call = { callId: "call-1", providerCallId: "p-1", state: "active", to: "+15550000000" };
  const playTts = vi.fn(async () => {});
  return {
    playTts,
    ctx: {
      activeCalls: new Map([["call-1", call]]),
      providerCallIdMap: new Map(),
      provider: { name: "twilio", playTts },
      config: { tts: { provider: "openai", providers: { openai: { voice: "alloy" } } } },
      storePath: "/tmp/voice-call.json",
    },
  };
}

describe("voice-call speak outbound sending hooks", () => {
  beforeEach(() => resetGlobalHookRunner());
  afterEach(() => resetGlobalHookRunner());

  it("plays the text message_sending rewrote", async () => {
    const registry = createEmptyPluginRegistry();
    const handler = vi.fn(async () => ({ content: "mediated" }));
    addTestHook({
      registry,
      pluginId: "test",
      hookName: "message_sending",
      handler: handler as PluginHookRegistration["handler"],
    });
    initializeGlobalHookRunner(registry);
    const { ctx, playTts } = createCtx();
    await expect(speak(ctx as never, "call-1", "raw")).resolves.toEqual({ success: true });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ to: "+15550000000", content: "raw" }),
      expect.objectContaining({ channelId: "voice-call", conversationId: "call-1" }),
    );
    expect(playTts).toHaveBeenCalledWith(expect.objectContaining({ text: "mediated" }));
  });

  it("plays nothing when message_sending cancels", async () => {
    const registry = createEmptyPluginRegistry();
    addTestHook({
      registry,
      pluginId: "test",
      hookName: "message_sending",
      handler: (async () => ({ cancel: true })) as PluginHookRegistration["handler"],
    });
    initializeGlobalHookRunner(registry);
    const { ctx, playTts } = createCtx();
    await expect(speak(ctx as never, "call-1", "raw")).resolves.toEqual({
      success: false,
      error: "blocked by an outbound sending hook",
    });
    expect(playTts).not.toHaveBeenCalled();
  });
});
