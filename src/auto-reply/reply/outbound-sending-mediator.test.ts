// Every reply the core dispatcher hands a channel runs the outbound sending
// hooks first, once: the channel's own deliver (and any deliverOutboundPayloads
// call inside it) sees the mediated payload inside the mediated scope.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
import { isOutboundSendMediated } from "../../infra/outbound/sending-scope.js";
import type { ReplyPayload } from "../types.js";

const hooks = vi.hoisted(() => ({
  messageSending: null as null | ((event: { content: string }) => unknown),
  calls: [] as Array<{ to: string; channelId?: string; content: string }>,
}));

vi.mock("../../plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => ({
    hasHooks: (name: string) => name === "message_sending" && hooks.messageSending !== null,
    runMessageSending: async (
      event: { to: string; content: string },
      ctx: { channelId?: string },
    ) => {
      hooks.calls.push({ to: event.to, channelId: ctx.channelId, content: event.content });
      return hooks.messageSending?.(event);
    },
    runMediaSending: async () => undefined,
  }),
}));

const { createReplyDispatcher } = await import("./reply-dispatcher.js");
const { createReplyOutboundMediator, withoutUnmediatedStreamingCallbacks } =
  await import("./outbound-sending-mediator.js");
const { runOutboundSendingHooks } = await import("../../infra/outbound/sending-hooks.js");

const cfg = {} as EnclawedConfig;

describe("reply dispatcher outbound mediation", () => {
  beforeEach(() => {
    hooks.messageSending = null;
    hooks.calls = [];
  });

  // Representative channels: each owns its own deliver callback.
  for (const channel of ["telegram", "slack", "signal", "whatsapp", "matrix", "line", "zalo"]) {
    it(`mediates ${channel} replies once before the channel's deliver`, async () => {
      hooks.messageSending = (event) => ({ content: event.content.toUpperCase() });
      const delivered: Array<{ payload: ReplyPayload; mediated: boolean }> = [];
      const dispatcher = createReplyDispatcher({
        deliver: async (payload) => {
          // A nested send path inside deliver must not mediate a second time.
          const nested = await runOutboundSendingHooks({
            text: payload.text ?? "",
            target: { cfg, channel, to: "peer" },
          });
          expect(nested.cancelled ? "" : nested.text).toBe(payload.text);
          delivered.push({ payload, mediated: isOutboundSendMediated() });
        },
      });
      dispatcher.setOutboundMediator?.(
        createReplyOutboundMediator({ cfg, channel, to: "peer", accountId: "a1" }),
      );
      dispatcher.sendBlockReply({ text: "block" });
      dispatcher.sendFinalReply({ text: "final" });
      dispatcher.markComplete();
      await dispatcher.waitForIdle();
      expect(delivered.map((d) => d.payload.text)).toEqual(["BLOCK", "FINAL"]);
      expect(delivered.every((d) => d.mediated)).toBe(true);
      expect(hooks.calls).toEqual([
        { to: "peer", channelId: channel, content: "block" },
        { to: "peer", channelId: channel, content: "final" },
      ]);
    });
  }

  it("drops a reply a sending hook cancels", async () => {
    hooks.messageSending = () => ({ cancel: true });
    const deliver = vi.fn(async () => {});
    const dispatcher = createReplyDispatcher({ deliver });
    dispatcher.setOutboundMediator?.(
      createReplyOutboundMediator({ cfg, channel: "irc", to: "#c" }),
    );
    dispatcher.sendFinalReply({ text: "secret" });
    dispatcher.markComplete();
    await dispatcher.waitForIdle();
    expect(deliver).not.toHaveBeenCalled();
  });

  it("drops a text-only reply a hook emptied", async () => {
    hooks.messageSending = () => ({ content: "" });
    const deliver = vi.fn(async () => {});
    const dispatcher = createReplyDispatcher({ deliver });
    dispatcher.setOutboundMediator?.(
      createReplyOutboundMediator({ cfg, channel: "irc", to: "#c" }),
    );
    dispatcher.sendFinalReply({ text: "secret" });
    dispatcher.markComplete();
    await dispatcher.waitForIdle();
    expect(deliver).not.toHaveBeenCalled();
  });

  it("delivers untouched with no mediator installed", async () => {
    hooks.messageSending = (event) => ({ content: `${event.content}!` });
    const seen: string[] = [];
    const dispatcher = createReplyDispatcher({
      deliver: async (payload) => {
        seen.push(payload.text ?? "");
        expect(isOutboundSendMediated()).toBe(false);
      },
    });
    dispatcher.sendFinalReply({ text: "plain" });
    dispatcher.markComplete();
    await dispatcher.waitForIdle();
    expect(seen).toEqual(["plain"]);
  });

  it("strips only the streaming callbacks the hooks cannot see", () => {
    const fn = () => {};
    const stripped = withoutUnmediatedStreamingCallbacks({
      onPartialReply: fn,
      onReasoningStream: fn,
      onItemEvent: fn,
      onPlanUpdate: fn,
      onCommandOutput: fn,
      onPatchSummary: fn,
      onBlockReply: fn,
      onToolResult: fn,
      onModelSelected: fn,
    });
    expect(Object.keys(stripped).toSorted()).toEqual(
      ["onBlockReply", "onModelSelected", "onToolResult"].toSorted(),
    );
  });
});
