// Plugin-handled message actions (agent message tool, CLI, gateway
// `message.action`) run the outbound sending hooks before the channel plugin
// sends, so a channel that handles `send` itself cannot bypass them.

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EnclawedConfig } from "../../config/types.enclawed.js";

const state = vi.hoisted(() => ({
  messageSending: null as null | ((event: { content: string }) => unknown),
  mediaSending: null as null | ((event: { media: Array<{ buffer: Buffer }> }) => unknown),
  handled: [] as Array<Record<string, unknown>>,
  mediatedAtHandle: [] as boolean[],
}));

vi.mock("../../plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => ({
    hasHooks: (name: string) =>
      (name === "message_sending" && state.messageSending !== null) ||
      (name === "media_sending" && state.mediaSending !== null),
    runMessageSending: async (event: { content: string }) => state.messageSending?.(event),
    runMediaSending: async (event: { media: Array<{ buffer: Buffer }> }) =>
      state.mediaSending?.(event),
  }),
}));

vi.mock("./index.js", async () => {
  const { isOutboundSendMediated } = await import("../../infra/outbound/sending-scope.js");
  return {
    getChannelPlugin: () => ({
      actions: {
        handleAction: async (ctx: { params: Record<string, unknown> }) => {
          state.handled.push({ ...ctx.params });
          state.mediatedAtHandle.push(isOutboundSendMediated());
          return { content: [{ type: "text", text: "ok" }], details: {} };
        },
      },
    }),
  };
});

const { dispatchChannelMessageAction } = await import("./message-action-dispatch.js");

const cfg = {} as EnclawedConfig;

describe("dispatchChannelMessageAction outbound sending hooks", () => {
  let dir: string;
  let previousStateDir: string | undefined;

  beforeEach(async () => {
    state.messageSending = null;
    state.mediaSending = null;
    state.handled = [];
    state.mediatedAtHandle = [];
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "action-sending-"));
    previousStateDir = process.env.ENCLAWED_STATE_DIR;
    process.env.ENCLAWED_STATE_DIR = path.join(dir, "state");
  });

  afterEach(async () => {
    if (previousStateDir === undefined) {
      delete process.env.ENCLAWED_STATE_DIR;
    } else {
      process.env.ENCLAWED_STATE_DIR = previousStateDir;
    }
    await fs.rm(dir, { recursive: true, force: true });
  });

  const run = (action: string, params: Record<string, unknown>) =>
    dispatchChannelMessageAction({
      channel: "discord",
      action: action as never,
      cfg,
      params,
      mediaAccess: { localRoots: [dir] },
    } as never);

  it("passes params through untouched with no sending hook", async () => {
    await run("send", { to: "c1", message: "hello" });
    expect(state.handled).toEqual([{ to: "c1", message: "hello" }]);
    expect(state.mediatedAtHandle).toEqual([false]);
  });

  it("hands the plugin the text message_sending rewrote, inside the mediated scope", async () => {
    state.messageSending = (event) => ({ content: `[m] ${event.content}` });
    await run("send", { to: "c1", message: "hello" });
    await run("thread-reply", { to: "c1", message: "in thread" });
    expect(state.handled.map((p) => p.message)).toEqual(["[m] hello", "[m] in thread"]);
    expect(state.mediatedAtHandle).toEqual([true, true]);
  });

  it("blocks the action when message_sending cancels", async () => {
    state.messageSending = () => ({ cancel: true });
    await expect(run("send", { to: "c1", message: "secret" })).rejects.toThrow(
      /blocked by an outbound sending hook/,
    );
    expect(state.handled).toEqual([]);
  });

  it("replaces a media path with the media_sending replacement", async () => {
    const file = path.join(dir, "a.png");
    await fs.writeFile(file, "original");
    state.mediaSending = (event) => {
      expect(event.media[0]?.buffer.toString()).toBe("original");
      return { media: [{ buffer: Buffer.from("scrambled"), contentType: "image/png" }] };
    };
    await run("send", { to: "c1", message: "pic", path: file });
    const params = state.handled[0];
    expect(params.path).toBeUndefined();
    expect(typeof params.media).toBe("string");
    expect(await fs.readFile(params.media as string, "utf8")).toBe("scrambled");
  });

  it("mediates an inline base64 buffer as bytes", async () => {
    state.mediaSending = (event) => {
      expect(event.media[0]?.buffer.toString()).toBe("inline");
      return { media: [{ buffer: Buffer.from("replaced"), contentType: "image/png" }] };
    };
    await run("sendAttachment", {
      to: "c1",
      buffer: Buffer.from("inline").toString("base64"),
      contentType: "image/jpeg",
    });
    const params = state.handled[0];
    expect(Buffer.from(params.buffer as string, "base64").toString()).toBe("replaced");
    expect(params.contentType).toBe("image/png");
  });

  it("leaves non-message actions to the tool-call chokepoint", async () => {
    state.messageSending = () => ({ cancel: true });
    await run("renameGroup", { to: "c1", name: "new name" });
    expect(state.handled).toEqual([{ to: "c1", name: "new name" }]);
  });
});
