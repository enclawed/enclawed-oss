// The shared outbound sending helper: message_sending then media_sending,
// rewrites and cancels, and the mediated scope that stops a second pass.

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
import {
  applyOutboundSendingOutcome,
  runOutboundSendingHooks,
  type OutboundSendingHookRunner,
} from "./sending-hooks.js";
import { isOutboundSendMediated, runAsMediatedOutboundSend } from "./sending-scope.js";

const cfg = {} as EnclawedConfig;

function createRunner(handlers: {
  messageSending?: OutboundSendingHookRunner["runMessageSending"];
  mediaSending?: OutboundSendingHookRunner["runMediaSending"];
}) {
  return {
    hasHooks: (name: string) =>
      (name === "message_sending" && Boolean(handlers.messageSending)) ||
      (name === "media_sending" && Boolean(handlers.mediaSending)),
    runMessageSending: vi.fn(handlers.messageSending ?? (async () => undefined)),
    runMediaSending: vi.fn(handlers.mediaSending ?? (async () => undefined)),
  } as unknown as OutboundSendingHookRunner & {
    runMessageSending: ReturnType<typeof vi.fn>;
    runMediaSending: ReturnType<typeof vi.fn>;
  };
}

describe("runOutboundSendingHooks", () => {
  let dir: string;
  let previousStateDir: string | undefined;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "sending-hooks-"));
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

  it("is unchanged with no handlers", async () => {
    const outcome = await runOutboundSendingHooks({
      hookRunner: createRunner({}),
      text: "hi",
      mediaUrls: ["/x.png"],
      target: { cfg, channel: "slack", to: "C1" },
    });
    expect(outcome).toEqual({
      cancelled: false,
      changed: false,
      text: "hi",
      mediaUrls: ["/x.png"],
    });
  });

  it("runs message_sending then media_sending, in order, and applies both rewrites", async () => {
    const file = path.join(dir, "a.png");
    await fs.writeFile(file, "original");
    const order: string[] = [];
    const runner = createRunner({
      messageSending: async (event) => {
        order.push(`message:${event.content}`);
        return { content: "rewritten" };
      },
      mediaSending: async (event) => {
        order.push(`media:${event.content}:${event.media[0]?.buffer.toString()}`);
        return { media: [{ buffer: Buffer.from("scrambled"), contentType: "image/png" }] };
      },
    });
    const outcome = await runOutboundSendingHooks({
      hookRunner: runner,
      text: "draft",
      mediaUrls: [file],
      target: { cfg, channel: "signal", to: "+15550000000", mediaAccess: { localRoots: [dir] } },
    });
    expect(order).toEqual(["message:draft", "media:rewritten:original"]);
    expect(outcome.cancelled).toBe(false);
    if (outcome.cancelled) {
      return;
    }
    expect(outcome.changed).toBe(true);
    expect(outcome.text).toBe("rewritten");
    expect(outcome.mediaUrls).toHaveLength(1);
    expect(await fs.readFile(outcome.mediaUrls[0], "utf8")).toBe("scrambled");
    expect(runner.runMessageSending).toHaveBeenCalledWith(
      expect.objectContaining({ to: "+15550000000", content: "draft" }),
      expect.objectContaining({ channelId: "signal", conversationId: "+15550000000" }),
    );
    const applied = applyOutboundSendingOutcome({ text: "draft", mediaUrl: file }, outcome);
    expect(applied).toEqual({
      text: "rewritten",
      mediaUrl: outcome.mediaUrls[0],
      mediaUrls: outcome.mediaUrls,
    });
  });

  it("cancels on message_sending cancel without loading media", async () => {
    const runner = createRunner({
      messageSending: async () => ({ cancel: true }),
      mediaSending: async () => undefined,
    });
    const outcome = await runOutboundSendingHooks({
      hookRunner: runner,
      text: "x",
      mediaUrls: ["/nowhere.png"],
      target: { cfg, channel: "matrix", to: "!room" },
    });
    expect(outcome).toEqual({ cancelled: true });
    expect(runner.runMediaSending).not.toHaveBeenCalled();
    expect(applyOutboundSendingOutcome({ text: "x" }, outcome)).toBeNull();
  });

  it("fails closed when an attachment cannot be loaded for media_sending", async () => {
    const runner = createRunner({ mediaSending: async () => undefined });
    await expect(
      runOutboundSendingHooks({
        hookRunner: runner,
        text: "x",
        mediaUrls: ["/etc/not-allowed.png"],
        target: { cfg, channel: "line", to: "U1", mediaAccess: { localRoots: [dir] } },
      }),
    ).rejects.toThrow();
  });

  it("skips both hooks inside a mediated delivery scope", async () => {
    const runner = createRunner({
      messageSending: async () => ({ content: "again" }),
      mediaSending: async () => ({ cancel: true }),
    });
    expect(isOutboundSendMediated()).toBe(false);
    const outcome = await runAsMediatedOutboundSend(async () => {
      expect(isOutboundSendMediated()).toBe(true);
      return await runOutboundSendingHooks({
        hookRunner: runner,
        text: "once",
        mediaUrls: ["/x.png"],
        target: { cfg, channel: "discord", to: "c" },
      });
    });
    expect(outcome).toEqual({
      cancelled: false,
      changed: false,
      text: "once",
      mediaUrls: ["/x.png"],
    });
    expect(runner.runMessageSending).not.toHaveBeenCalled();
    expect(isOutboundSendMediated()).toBe(false);
  });
});
