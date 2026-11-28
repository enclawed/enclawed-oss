/**
 * Test: media_sending hook runner semantics (sequential rewrite chain,
 * terminal cancel, throwing handlers skipped).
 */
import { describe, expect, it, vi } from "vitest";
import { createHookRunnerWithRegistry } from "./hooks.test-helpers.js";
import type { PluginHookMediaSendingEvent } from "./types.js";

const ctx = { channelId: "demo-channel" };
const event = (): PluginHookMediaSendingEvent => ({
  to: "user-1",
  content: "caption",
  media: [{ source: "/tmp/a.png", buffer: Buffer.from("a"), contentType: "image/png" }],
});

describe("media_sending hook runner", () => {
  it("returns undefined when no handler rewrites", async () => {
    const handler = vi.fn();
    const { runner } = createHookRunnerWithRegistry([{ hookName: "media_sending", handler }]);
    expect(await runner.runMediaSending(event(), ctx)).toBeUndefined();
    expect(handler).toHaveBeenCalledWith(event(), ctx);
  });

  it("chains rewrites: a later handler sees the earlier replacement", async () => {
    const first = vi.fn().mockReturnValue({
      media: [{ buffer: Buffer.from("b"), contentType: "image/png" }],
    });
    const second = vi.fn((e: PluginHookMediaSendingEvent) => ({
      media: [...e.media, { buffer: Buffer.from("c") }],
    }));
    const { runner } = createHookRunnerWithRegistry([
      { hookName: "media_sending", handler: first, pluginId: "p1" },
      { hookName: "media_sending", handler: second, pluginId: "p2" },
    ]);
    const original = event();
    const result = await runner.runMediaSending(original, ctx);
    expect(second.mock.calls[0][0].media[0]).toMatchObject({
      source: "plugin:p1",
      contentType: "image/png",
    });
    expect(result?.media?.map((m) => m.buffer.toString())).toEqual(["b", "c"]);
    // The caller's event is not mutated.
    expect(original.media[0].source).toBe("/tmp/a.png");
  });

  it("treats cancel as terminal", async () => {
    const later = vi.fn();
    const { runner } = createHookRunnerWithRegistry([
      { hookName: "media_sending", handler: () => ({ cancel: true }), pluginId: "p1" },
      { hookName: "media_sending", handler: later, pluginId: "p2" },
    ]);
    expect(await runner.runMediaSending(event(), ctx)).toEqual({ cancel: true });
    expect(later).not.toHaveBeenCalled();
  });

  it("skips a throwing handler and keeps running the rest", async () => {
    const { runner } = createHookRunnerWithRegistry([
      {
        hookName: "media_sending",
        handler: () => {
          throw new Error("boom");
        },
        pluginId: "p1",
      },
      {
        hookName: "media_sending",
        handler: () => ({ media: [] }),
        pluginId: "p2",
      },
    ]);
    expect(await runner.runMediaSending(event(), ctx)).toEqual({ media: [] });
  });
});
