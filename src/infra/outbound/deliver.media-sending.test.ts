// The media_sending chokepoint in outbound delivery: attachments are loaded
// under the sender's media-access policy, handed to the hook, and the hook's
// replacements are saved and sent in place of the originals.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelOutboundAdapter } from "../../channels/plugins/types.adapters.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type {
  PluginHookMediaSendingEvent,
  PluginHookMediaSendingResult,
} from "../../plugins/hook-message.types.js";
import {
  releasePinnedPluginChannelRegistry,
  setActivePluginRegistry,
} from "../../plugins/runtime.js";
import { createOutboundTestPlugin, createTestRegistry } from "../../test-utils/channel-plugins.js";

const state = vi.hoisted(() => ({
  mediaHandler: null as
    | ((event: PluginHookMediaSendingEvent) => PluginHookMediaSendingResult | undefined)
    | null,
  loaded: [] as string[],
  saved: [] as Array<{ text: string; contentType?: string; subdir?: string }>,
}));

vi.mock("../../plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => ({
    hasHooks: (name: string) => name === "media_sending" && state.mediaHandler !== null,
    runMessageSending: async () => undefined,
    runMessageSent: async () => {},
    runMediaSending: async (event: PluginHookMediaSendingEvent) => state.mediaHandler?.(event),
  }),
}));

vi.mock("./delivery-queue.js", () => ({
  enqueueDelivery: async () => "queue-id",
  ackDelivery: async () => {},
  failDelivery: async () => {},
}));

vi.mock("./media-sending.runtime.js", () => ({
  loadWebMediaRaw: async (source: string, options: { optimizeImages?: boolean }) => {
    if (source.includes("forbidden")) {
      throw new Error("Local media path is not under an allowed directory");
    }
    // The raw bytes are what the hook mediates: never the optimized JPEG.
    expect(options.optimizeImages).toBe(false);
    state.loaded.push(source);
    return { buffer: Buffer.from(`bytes:${source}`), contentType: "image/png", kind: "image" };
  },
  saveMediaBuffer: async (buffer: Buffer, contentType?: string, subdir?: string) => {
    state.saved.push({ text: buffer.toString(), contentType, subdir });
    return { path: `/state/media/outbound/${state.saved.length}.png`, contentType };
  },
}));

const { deliverOutboundPayloads } = await import("./deliver.js");

const sentMedia: string[] = [];
const sentText: string[] = [];
const outbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  sendText: async ({ text }) => {
    sentText.push(text);
    return { channel: "demo", messageId: `t${sentText.length}` };
  },
  sendMedia: async ({ mediaUrl }) => {
    sentMedia.push(mediaUrl ?? "");
    return { channel: "demo", messageId: `m${sentMedia.length}` };
  },
};

const cfg = {} as EnclawedConfig;
const send = (payload: { text?: string; mediaUrls?: string[] }) =>
  deliverOutboundPayloads({ cfg, channel: "demo" as never, to: "user-1", payloads: [payload] });

beforeEach(() => {
  releasePinnedPluginChannelRegistry();
  setActivePluginRegistry(
    createTestRegistry([
      {
        pluginId: "demo",
        source: "test",
        plugin: createOutboundTestPlugin({ id: "demo" as never, outbound }),
      },
    ]),
  );
  state.mediaHandler = null;
  state.loaded = [];
  state.saved = [];
  sentMedia.length = 0;
  sentText.length = 0;
});

afterEach(() => {
  releasePinnedPluginChannelRegistry();
});

describe("outbound delivery: media_sending hook", () => {
  it("does not load media when no handler is registered", async () => {
    await send({ text: "hi", mediaUrls: ["/tmp/a.png"] });
    expect(state.loaded).toEqual([]);
    expect(sentMedia).toEqual(["/tmp/a.png"]);
  });

  it("hands the loaded attachments to the hook and sends its replacements", async () => {
    let seen: PluginHookMediaSendingEvent | undefined;
    state.mediaHandler = (event) => {
      seen = event;
      // Rewrite and reorder: second attachment first.
      return {
        media: event.media.toReversed().map((m) => ({
          buffer: Buffer.from(`scrambled:${m.buffer.toString()}`),
          contentType: "image/png",
        })),
      };
    };
    await send({ text: "caption", mediaUrls: ["/tmp/a.png", "/tmp/b.png"] });
    expect(seen?.content).toBe("caption");
    expect(seen?.media.map((m) => m.source)).toEqual(["/tmp/a.png", "/tmp/b.png"]);
    expect(state.saved).toEqual([
      { text: "scrambled:bytes:/tmp/b.png", contentType: "image/png", subdir: "outbound" },
      { text: "scrambled:bytes:/tmp/a.png", contentType: "image/png", subdir: "outbound" },
    ]);
    expect(sentMedia).toEqual(["/state/media/outbound/1.png", "/state/media/outbound/2.png"]);
  });

  it("sends the originals when the hook returns nothing", async () => {
    state.mediaHandler = () => undefined;
    await send({ text: "caption", mediaUrls: ["/tmp/a.png"] });
    expect(state.loaded).toEqual(["/tmp/a.png"]);
    expect(sentMedia).toEqual(["/tmp/a.png"]);
  });

  it("drops the whole message on cancel", async () => {
    state.mediaHandler = () => ({ cancel: true });
    await send({ text: "caption", mediaUrls: ["/tmp/a.png"] });
    expect(sentMedia).toEqual([]);
    expect(sentText).toEqual([]);
  });

  it("sends the text alone when every attachment is dropped", async () => {
    state.mediaHandler = () => ({ media: [] });
    await send({ text: "caption", mediaUrls: ["/tmp/a.png"] });
    expect(sentMedia).toEqual([]);
    expect(sentText).toEqual(["caption"]);
  });

  it("fails closed when an attachment cannot be loaded for the hook", async () => {
    state.mediaHandler = () => undefined;
    await expect(send({ text: "x", mediaUrls: ["/etc/forbidden.png"] })).rejects.toThrow(
      /not under an allowed directory/,
    );
    expect(sentMedia).toEqual([]);
  });
});
