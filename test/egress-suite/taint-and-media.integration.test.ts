// Integration: the public taint-tagging API (`enclawed/framework`) against
// the real taint-tracker stage behind the real mediator, and the shipped
// image scrambler plugin behind the mediator's media chokepoint.

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import imageScramblerPlugin from "../../extensions/egress-image-scrambler/index.js";
import {
  createEgressMediator,
  registerEgressStage,
  resetEgressRegistry,
  resetMediaRegistry,
  resolveEgressMediatorConfig,
} from "../../extensions/egress-mediator/api.js";
import {
  buildTaintTrackerStage,
  sharedTaintStore,
  tagSensitiveValue,
} from "../../src/framework.js";

type Handler = (event: unknown, ctx: unknown) => Promise<unknown>;

function harness(pluginConfig: Record<string, unknown>) {
  const hooks = new Map<string, Handler>();
  const api = {
    on: (name: string, handler: Handler) => hooks.set(name, handler),
    logger: { warn: () => {}, info: () => {}, error: () => {}, debug: () => {} },
  };
  createEgressMediator(api as never, { config: resolveEgressMediatorConfig(pluginConfig, {}) });
  return (name: string, event: unknown, ctx: unknown) => hooks.get(name)!(event, ctx);
}

afterEach(() => {
  resetEgressRegistry();
  resetMediaRegistry();
  sharedTaintStore().clear();
});

describe("public taint tagging", () => {
  it("blocks a tagged canary on every conversation once an app tags it", async () => {
    const fire = harness({});
    registerEgressStage(buildTaintTrackerStage());
    const canary = "canary-4b1d-9e7f-session";
    const send = (conversationId: string) =>
      fire(
        "message_sending",
        { to: "u1", content: `the code is ${canary}` },
        { channelId: "demo", conversationId },
      );
    expect(await send("conv-a")).toBeUndefined();
    tagSensitiveValue(canary, { label: "session-canary" });
    expect(await send("conv-a")).toEqual({ cancel: true });
    expect(await send("conv-b")).toEqual({ cancel: true });
  });
});

describe("media chokepoint with the shipped image scrambler", () => {
  it("removes an alpha-LSB carrier from an outbound PNG in enforce mode", async () => {
    imageScramblerPlugin.register({ pluginConfig: {} } as never);
    const fire = harness({ stages: { "egress-image-scrambler": { mode: "enforce" } } });
    const rgba = Buffer.alloc(8 * 8 * 4);
    for (let i = 0; i < 64; i++) {
      rgba.set([120, 60, 30, 128 | (i & 1)], i * 4);
    }
    const png = await sharp(rgba, { raw: { width: 8, height: 8, channels: 4 } })
      .png()
      .toBuffer();
    const out = (await fire(
      "media_sending",
      { to: "u1", content: "", media: [{ source: "/m/0", buffer: png, contentType: "image/png" }] },
      { channelId: "demo" },
    )) as { media: Array<{ buffer: Buffer }> };
    const { data } = await sharp(out.media[0].buffer).raw().toBuffer({ resolveWithObject: true });
    const alphas = new Set<number>();
    for (let i = 0; i < 64; i++) {
      alphas.add(data[i * 4 + 3]);
    }
    // 128 and 129 both snap to the same grid level: the carrier is gone.
    expect(alphas.size).toBe(1);
  });
});
