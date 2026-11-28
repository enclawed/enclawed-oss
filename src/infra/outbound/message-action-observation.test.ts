import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ChannelMessageActionObservationContext,
  ChannelMessageObservation,
  ChannelOutboundObservedCall,
  ChannelOutboundObservedPoll,
  ChannelPlugin,
} from "../../channels/plugins/types.public.js";
import type { EnclawedConfig } from "../../config/config.js";
import { setActivePluginRegistry } from "../../plugins/runtime.js";
import {
  createChannelTestPluginBase,
  createOutboundTestPlugin,
  createTestRegistry,
} from "../../test-utils/channel-plugins.js";
import { combineChannelObservations, observeMessageAction } from "./message-action-observation.js";
import { runMessageAction, type RunMessageActionParams } from "./message-action-runner.js";

// A core-path test channel that sends the text, the media URL and the reply
// id, and nothing else (no threads, flags or silence).
function observeCoreCall({ kind, ctx }: ChannelOutboundObservedCall): ChannelMessageObservation {
  return {
    target: `${ctx.accountId ?? "default"}/${ctx.to}`,
    content: {
      op: kind,
      text: ctx.text,
      media: ctx.mediaUrl ?? null,
      replyTo: ctx.replyToId ?? null,
    },
  };
}

function observePoll(poll: ChannelOutboundObservedPoll): ChannelMessageObservation {
  return {
    target: `${poll.accountId ?? "default"}/${poll.to}`,
    content: { op: "poll", poll: poll.poll },
  };
}

// A plugin-handled test channel whose `react` sends the message id and the
// emoji, and whose `send` sends the message and reply id.
function observeAction(
  ctx: ChannelMessageActionObservationContext,
): ChannelMessageObservation | null {
  const p = ctx.params;
  if (ctx.action === "react") {
    return {
      target: typeof p.to === "string" ? p.to : typeof p.target === "string" ? p.target : "",
      content: { op: "react", messageId: p.messageId, emoji: p.emoji ?? null },
    };
  }
  if (ctx.action === "send") {
    return {
      target: String(p.to),
      content: { op: "send", text: p.message, replyTo: p.replyTo ?? null },
    };
  }
  return null;
}

const sendText = vi.fn(async () => ({ channel: "corechat", messageId: "t1" }));
const sendMedia = vi.fn(async () => ({ channel: "corechat", messageId: "m1" }));
const sendPoll = vi.fn(async () => ({ messageId: "p1" }));
const handleAction = vi.fn(async () => ({ content: [], details: { ok: true } }));

// Targets are ids, with or without a `channel:` prefix.
const messaging = {
  normalizeTarget: (raw: string) => raw.replace(/^channel:/i, "").trim() || undefined,
  targetResolver: { looksLikeId: () => true },
};

function corePlugin(options: { declare: boolean }): ChannelPlugin {
  return createOutboundTestPlugin({
    id: "corechat",
    messaging,
    outbound: {
      deliveryMode: "direct",
      chunker: (text: string, limit: number) => {
        const chunks: string[] = [];
        for (let i = 0; i < text.length; i += limit) {
          chunks.push(text.slice(i, i + limit));
        }
        return chunks;
      },
      textChunkLimit: 4000,
      sendText,
      sendMedia,
      sendPoll,
      ...(options.declare ? { observeSend: observeCoreCall, observePoll } : {}),
    },
  });
}

function actionPlugin(options: { declare: boolean }): ChannelPlugin {
  return {
    ...createChannelTestPluginBase({ id: "actchat" }),
    messaging,
    outbound: { deliveryMode: "direct" },
    actions: {
      describeMessageTool: () => ({ actions: ["send", "react"] }),
      supportsAction: ({ action }) => action === "send" || action === "react",
      handleAction,
      ...(options.declare ? { observeAction } : {}),
    },
  } as ChannelPlugin;
}

function install(plugins: ChannelPlugin[]) {
  setActivePluginRegistry(
    createTestRegistry(plugins.map((plugin) => ({ pluginId: plugin.id, source: "test", plugin }))),
  );
}

const cfg = {
  channels: { corechat: { enabled: true }, actchat: { enabled: true } },
} as EnclawedConfig;

function input(
  action: RunMessageActionParams["action"],
  params: Record<string, unknown>,
  extra: Partial<RunMessageActionParams> = {},
): RunMessageActionParams {
  return { cfg, action, params, ...extra };
}

describe("message action observations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    install([corePlugin({ declare: true }), actionPlugin({ declare: true })]);
  });

  afterEach(() => {
    setActivePluginRegistry(createTestRegistry([]));
  });

  it("gives every spelling of one core-path send the same observation", async () => {
    const base = await observeMessageAction(
      input("send", { channel: "corechat", target: "room1", message: "hi\nthere" }),
    );
    expect(base).not.toBeNull();
    const spellings: Array<[Record<string, unknown>, Partial<RunMessageActionParams>?]> = [
      // Legacy target fields collapse onto `target`.
      [{ channel: "corechat", to: "room1", message: "hi\nthere" }],
      [{ channel: "corechat", channelId: "room1", message: "hi\nthere" }],
      [{ channel: "corechat", target: "channel:room1", message: "hi\nthere" }],
      // Escaped newlines, and a caption standing in for an empty message.
      [{ channel: "corechat", target: "room1", message: "hi\\nthere" }],
      [{ channel: "corechat", target: "room1", message: "", caption: "hi\nthere" }],
      // Channel and target defaults from the current conversation.
      [
        { message: "hi\nthere" },
        { toolContext: { currentChannelProvider: "corechat", currentChannelId: "room1" } },
      ],
      // Parameters that never leave: delivery flags this channel ignores,
      // best-effort, gateway options, a thread the channel does not send.
      [
        {
          channel: "corechat",
          target: "room1",
          message: "hi\nthere",
          bestEffort: true,
          silent: true,
          gifPlayback: true,
          forceDocument: true,
          asDocument: false,
          threadId: "t9",
          timeoutMs: 5,
        },
      ],
    ];
    for (const [params, extra] of spellings) {
      expect(
        await observeMessageAction(input("send", params, extra)),
        JSON.stringify(params),
      ).toEqual(base);
    }
  });

  it("collapses media aliases and reply aliases as the send path does", async () => {
    const a = await observeMessageAction(
      input("send", { channel: "corechat", target: "room1", media: "https://x.test/a.png" }),
    );
    for (const key of ["path", "filePath", "mediaUrl", "fileUrl"]) {
      expect(
        await observeMessageAction(
          input("send", { channel: "corechat", target: "room1", [key]: "https://x.test/a.png" }),
        ),
        key,
      ).toEqual(a);
    }
    // A reply directive in the text is the reply id the send path uses.
    const reply = await observeMessageAction(
      input("send", { channel: "corechat", target: "room1", message: "ok", replyTo: "42" }),
    );
    expect(
      await observeMessageAction(
        input("send", { channel: "corechat", target: "room1", message: "[[reply_to:42]] ok" }),
      ),
    ).toEqual(reply);
  });

  it("changes with every field the channel sends", async () => {
    const base = { channel: "corechat", target: "room1", message: "hi" };
    const a = await observeMessageAction(input("send", base));
    const variants: Array<[Record<string, unknown>, Partial<RunMessageActionParams>?]> = [
      [{ ...base, message: "hi!" }],
      [{ ...base, target: "room2" }],
      [{ ...base, replyTo: "7" }],
      [{ ...base, media: "https://x.test/a.png" }],
      [{ ...base, accountId: "work" }],
    ];
    for (const [params, extra] of variants) {
      expect(
        await observeMessageAction(input("send", params, extra)),
        JSON.stringify(params),
      ).not.toEqual(a);
    }
  });

  it("matches what the core path hands the channel adapter", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "msg-observe-"));
    try {
      const cases: Record<string, unknown>[] = [
        { channel: "corechat", target: "room1", message: "hello", replyTo: "9" },
        { channel: "corechat", target: "room1", message: "x".repeat(9000) },
        {
          channel: "corechat",
          target: "room1",
          message: "two files",
          media: "https://x.test/a.png",
        },
      ];
      for (const params of cases) {
        vi.clearAllMocks();
        const observed = await observeMessageAction(input("send", params));
        await runMessageAction(input("send", params));
        const handed: ChannelMessageObservation[] = [];
        for (const [ctx] of sendText.mock.calls as unknown as Array<
          [ChannelOutboundObservedCall["ctx"]]
        >) {
          handed.push(observeCoreCall({ kind: "text", ctx }));
        }
        for (const [ctx] of sendMedia.mock.calls as unknown as Array<
          [ChannelOutboundObservedCall["ctx"]]
        >) {
          handed.push(observeCoreCall({ kind: "media", ctx }));
        }
        expect(handed.length).toBeGreaterThan(0);
        expect(observed, JSON.stringify(params).slice(0, 80)).toEqual(
          combineChannelObservations("corechat", handed),
        );
      }
      // A long message is chunked into several adapter calls, each declared.
      const long = await observeMessageAction(
        input("send", { channel: "corechat", target: "room1", message: "x".repeat(9000) }),
      );
      expect(long?.type).toBe("send");
      expect(JSON.parse((long as { content: string }).content).length).toBeGreaterThan(1);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("matches what the core poll path hands sendPoll", async () => {
    const params = {
      channel: "corechat",
      target: "room1",
      pollQuestion: "Lunch?",
      pollOption: ["a", "b"],
      pollMulti: true,
    };
    const observed = await observeMessageAction(input("poll", params));
    expect(observed).not.toBeNull();
    // The core poll path goes through the gateway; the gateway hands
    // `sendPoll` the shared poll model built from the same arguments.
    expect(observed?.type).toBe("send");
    const poll = JSON.parse((observed as { content: string }).content)[0].c.poll;
    expect(poll).toEqual({ question: "Lunch?", options: ["a", "b"], maxSelections: 2 });
    expect(sendPoll).not.toHaveBeenCalled();
    expect(
      await observeMessageAction(input("poll", { ...params, pollOption: ["a", "c"] })),
    ).not.toEqual(observed);
  });

  it("matches what a plugin-handled action hands handleAction", async () => {
    const params = { channel: "actchat", target: "room1", messageId: "m5", emoji: "ok" };
    const observed = await observeMessageAction(input("react", params));
    await runMessageAction(input("react", params));
    const [ctx] = handleAction.mock.calls[0] as unknown as [ChannelMessageActionObservationContext];
    expect(observed).toEqual(combineChannelObservations("actchat", [observeAction(ctx)!]));
    // The emoji is sent; a parameter the channel ignores is not.
    expect(await observeMessageAction(input("react", { ...params, emoji: "no" }))).not.toEqual(
      observed,
    );
    expect(await observeMessageAction(input("react", { ...params, silent: true }))).toEqual(
      observed,
    );
    // A plugin-handled send sees the send path's normalized params.
    const send = await observeMessageAction(
      input("send", { channel: "actchat", target: "room1", message: "a\\nb" }),
    );
    expect(send).toEqual(
      combineChannelObservations("actchat", [
        { target: "room1", content: { op: "send", text: "a\nb", replyTo: null } },
      ]),
    );
  });

  it("declares nothing for a dry run, a broadcast, or an undeclared channel or action", async () => {
    const send = { channel: "corechat", target: "room1", message: "hi" };
    expect(await observeMessageAction(input("send", { ...send, dryRun: true }))).toEqual({
      type: "none",
    });
    expect(await observeMessageAction(input("send", send, { dryRun: true }))).toEqual({
      type: "none",
    });
    expect(
      await observeMessageAction(input("broadcast", { targets: ["room1"], message: "hi" })),
    ).toBeNull();
    // An action the plugin does not declare.
    expect(
      await observeMessageAction(
        input("edit", { channel: "actchat", target: "room1", message: "x" }),
      ),
    ).toBeNull();
    // A call that would fail before sending.
    expect(
      await observeMessageAction(input("send", { channel: "corechat", message: "hi" })),
    ).toBeNull();

    install([corePlugin({ declare: false }), actionPlugin({ declare: false })]);
    expect(await observeMessageAction(input("send", send))).toBeNull();
    expect(
      await observeMessageAction(
        input("poll", { ...send, pollQuestion: "q", pollOption: ["a", "b"] }),
      ),
    ).toBeNull();
    expect(
      await observeMessageAction(
        input("react", { channel: "actchat", target: "room1", messageId: "m", emoji: "x" }),
      ),
    ).toBeNull();
    expect(sendText).not.toHaveBeenCalled();
    expect(handleAction).not.toHaveBeenCalled();
  });

  it("declares nothing for a channel that delivers through the gateway", async () => {
    install([
      createOutboundTestPlugin({
        id: "corechat",
        messaging,
        outbound: { deliveryMode: "gateway", sendText, observeSend: observeCoreCall },
      }),
    ]);
    expect(
      await observeMessageAction(
        input("send", { channel: "corechat", target: "room1", message: "hi" }),
      ),
    ).toBeNull();
  });
});
