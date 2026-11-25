import {
  registerMediaScrambler,
  resetMediaRegistry,
  type AudioPayload,
  type ImagePayload,
} from "@enclawed/egress-core";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { resolveEgressMediatorConfig } from "./config.js";
import { decodeWav, encodeWav } from "./media-codec.js";
import { createEgressMediator } from "./mediator.js";

type Handler = (event: unknown, ctx: unknown) => Promise<unknown>;
type MediaResult = {
  cancel?: boolean;
  media?: Array<{ buffer: Buffer; contentType?: string; fileName?: string }>;
};

function setup(pluginConfig: Record<string, unknown> = {}) {
  const hooks = new Map<string, Handler>();
  const api = {
    pluginConfig,
    on: (name: string, handler: Handler) => hooks.set(name, handler),
    logger: { warn: () => {}, info: () => {}, error: () => {}, debug: () => {} },
  };
  const mediator = createEgressMediator(api as never, {
    config: resolveEgressMediatorConfig(pluginConfig, {}),
  });
  const send = async (
    media: Array<{ buffer: Buffer; contentType?: string; fileName?: string }>,
  ): Promise<MediaResult | undefined> =>
    (await hooks.get("media_sending")!(
      { to: "u1", content: "caption", media: media.map((m, i) => ({ source: `/m/${i}`, ...m })) },
      { channelId: "demo", conversationId: "conv-1" },
    )) as MediaResult | undefined;
  return { hooks, send, mediator };
}

async function png(fill: number, alpha = 255): Promise<Buffer> {
  const rgba = Buffer.alloc(4 * 4 * 4);
  for (let p = 0; p < rgba.length; p += 4) {
    rgba[p] = fill;
    rgba[p + 1] = fill;
    rgba[p + 2] = fill;
    rgba[p + 3] = alpha;
  }
  return await sharp(rgba, { raw: { width: 4, height: 4, channels: 4 } })
    .png()
    .toBuffer();
}

async function pixels(buffer: Buffer): Promise<number[]> {
  const { data } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return [...data.subarray(0, 4)];
}

const clearLsb = (img: ImagePayload): ImagePayload => ({
  ...img,
  rgba: img.rgba.map((v) => v & 0xfe),
});

const enforceImage = { stages: { "egress-image-scrambler": { mode: "enforce" } } };

afterEach(() => {
  resetMediaRegistry();
});

describe("egress-mediator: media chokepoint", () => {
  it("registers media_sending unless media.enabled is false", () => {
    expect(setup().hooks.has("media_sending")).toBe(true);
    expect(setup({ media: { enabled: false } }).hooks.has("media_sending")).toBe(false);
  });

  it("is inert with no media scrambler registered and ordering not enforced", async () => {
    const { send } = setup();
    expect(await send([{ buffer: await png(101), contentType: "image/png" }])).toBeUndefined();
  });

  it("scrambles an image through an enforcing scrambler and re-encodes it as PNG", async () => {
    registerMediaScrambler({ kind: "image", id: "egress-image-scrambler", scramble: clearLsb });
    const { send, mediator } = setup(enforceImage);
    const jpegLike = await sharp(await png(101))
      .jpeg({ quality: 100 })
      .toBuffer();
    const out = await send([{ buffer: jpegLike, contentType: "image/jpeg", fileName: "a.jpg" }]);
    expect(out?.media).toHaveLength(1);
    expect(out!.media![0]!.contentType).toBe("image/png");
    expect(out!.media![0]!.fileName).toBe("a.png");
    for (const v of await pixels(out!.media![0]!.buffer)) {
      expect(v & 1).toBe(0);
    }
    expect(mediator.audit.records().some((r) => r.finding.code === "media-scrambled")).toBe(true);
  });

  it("records but does not apply a scrambler in audit mode", async () => {
    registerMediaScrambler({ kind: "image", id: "egress-image-scrambler", scramble: clearLsb });
    const { send, mediator } = setup();
    expect(await send([{ buffer: await png(101), contentType: "image/png" }])).toBeUndefined();
    expect(
      mediator.audit.records().some((r) => r.finding.code === "rewrite-suppressed-audit"),
    ).toBe(true);
  });

  it("fails closed on an undecodable image while the image scrambler enforces", async () => {
    registerMediaScrambler({ kind: "image", id: "egress-image-scrambler", scramble: clearLsb });
    const garbage = { buffer: Buffer.from("not an image"), contentType: "image/png" };
    expect(await setup(enforceImage).send([garbage])).toEqual({ cancel: true });
    // In audit mode the same attachment passes and is reported.
    const audited = setup();
    expect(await audited.send([garbage])).toBeUndefined();
    expect(
      audited.mediator.audit.records().some((r) => r.finding.code === "media-undecodable"),
    ).toBe(true);
  });

  it("scrambles every channel of a WAV and keeps its format", async () => {
    const silence = (a: AudioPayload): AudioPayload => ({
      ...a,
      samples: new Float32Array(a.samples.length),
    });
    registerMediaScrambler({ kind: "audio", id: "egress-audio-scrambler", scramble: silence });
    const { send } = setup({ stages: { "egress-audio-scrambler": { mode: "enforce" } } });
    const tone = (phase: number): AudioPayload => ({
      sampleRate: 8000,
      samples: Float32Array.from({ length: 64 }, (_, i) => 0.5 * Math.sin(i / 4 + phase)),
    });
    const wav = encodeWav([tone(0), tone(1)], {
      audioFormat: 1,
      bitsPerSample: 16,
      sampleRate: 8000,
    });
    const out = await send([{ buffer: wav, contentType: "audio/wav", fileName: "v.wav" }]);
    const decoded = decodeWav(out!.media![0]!.buffer);
    expect(decoded.format).toEqual({ audioFormat: 1, bitsPerSample: 16, sampleRate: 8000 });
    expect(decoded.channels).toHaveLength(2);
    for (const channel of decoded.channels) {
      expect(channel.samples.every((v) => v === 0)).toBe(true);
    }
  });

  it("puts attachments into canonical order when ordering enforces, documents last", async () => {
    const { send } = setup({ stages: { "egress-media-order": { mode: "enforce" } } });
    const a = await png(10);
    const b = await png(80);
    const c = await png(200);
    const pdf = Buffer.from("%PDF-1.4 test");
    const orders = [
      [a, b, pdf, c],
      [pdf, c, b, a],
      [b, a, c, pdf],
    ];
    const results: string[][] = [];
    for (const order of orders) {
      const out = await send(
        order.map((buffer) => ({
          buffer,
          contentType: buffer === pdf ? "application/pdf" : "image/png",
        })),
      );
      const media = out?.media ?? order.map((buffer) => ({ buffer }));
      results.push(media.map((m) => m.buffer.toString("base64")));
    }
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
    expect(results[0]!.at(-1)).toBe(pdf.toString("base64"));
  });
});
