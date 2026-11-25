// Decode outbound attachments into the media payloads the media scramblers
// work on, and encode scrambled payloads back to bytes.
//
//   - Images: any raster format sharp decodes (PNG, JPEG, WebP, GIF, AVIF,
//     TIFF; the first frame of an animation), as 8-bit RGBA. A scrambled
//     image is always re-encoded as PNG: lossless, so the scramble survives
//     exactly, and with no metadata (EXIF and text chunks are dropped).
//   - Audio: PCM WAV (8, 16, 24 or 32-bit integer, 32-bit float), each
//     channel scrambled separately and re-encoded at its original format.
//     Compressed audio (MP3, Ogg, Opus, AAC) is not decodable here.
//
// sharp is loaded lazily and only when an image actually needs decoding.

import type { AudioPayload, ImagePayload } from "@enclawed/egress-core";

export type DecodedMedia =
  | { kind: "image"; payload: ImagePayload }
  | { kind: "audio"; channels: AudioPayload[]; format: WavFormat }
  /** An image or audio attachment this codec cannot decode. */
  | { kind: "undecodable"; mediaKind: "image" | "audio"; reason: string }
  /** Not image or audio (video, documents): no scrambler applies. */
  | { kind: "opaque" };

type WavFormat = { audioFormat: 1 | 3; bitsPerSample: 8 | 16 | 24 | 32; sampleRate: number };

/** Largest image the codec decodes, in pixels (matches the gateway's image limit). */
const MAX_INPUT_PIXELS = 25_000_000;

type SharpModule = typeof import("sharp");
type SharpFactory = SharpModule["default"];
let sharpPromise: Promise<SharpFactory> | undefined;

async function loadSharp(): Promise<SharpFactory> {
  sharpPromise ??= import("sharp").then(
    (mod) =>
      (mod as unknown as { default?: SharpFactory }).default ?? (mod as unknown as SharpFactory),
  );
  return await sharpPromise;
}

function isWav(buffer: Buffer): boolean {
  return (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WAVE"
  );
}

/** Classify an attachment by its content type, falling back to a WAV header sniff. */
export function mediaKindOf(
  contentType: string | undefined,
  buffer: Buffer,
): "image" | "audio" | "other" {
  const mime = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (mime.startsWith("image/")) {
    return "image";
  }
  if (mime.startsWith("audio/") || isWav(buffer)) {
    return "audio";
  }
  return "other";
}

// --- WAV ------------------------------------------------------------------

type WavChunks = { format: WavFormat; channels: number; data: Buffer };

function parseWav(buffer: Buffer): WavChunks {
  if (!isWav(buffer)) {
    throw new Error("not a RIFF/WAVE file");
  }
  let offset = 12;
  let fmt: { audioFormat: number; channels: number; sampleRate: number; bits: number } | null =
    null;
  let data: Buffer | null = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (body + size > buffer.length) {
      throw new Error(`truncated ${id} chunk`);
    }
    if (id === "fmt ") {
      let audioFormat = buffer.readUInt16LE(body);
      if (audioFormat === 0xfffe && size >= 40) {
        // WAVE_FORMAT_EXTENSIBLE: the real format is the sub-format GUID's first word.
        audioFormat = buffer.readUInt16LE(body + 24);
      }
      fmt = {
        audioFormat,
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bits: buffer.readUInt16LE(body + 14),
      };
    } else if (id === "data") {
      data = buffer.subarray(body, body + size);
    }
    offset = body + size + (size % 2);
  }
  if (!fmt || !data) {
    throw new Error("missing fmt or data chunk");
  }
  const pcm = fmt.audioFormat === 1 && [8, 16, 24, 32].includes(fmt.bits);
  const float = fmt.audioFormat === 3 && fmt.bits === 32;
  if (!(pcm || float) || fmt.channels < 1 || fmt.sampleRate < 1) {
    throw new Error(`unsupported WAV format ${fmt.audioFormat}/${fmt.bits}-bit`);
  }
  return {
    format: {
      audioFormat: fmt.audioFormat as 1 | 3,
      bitsPerSample: fmt.bits as WavFormat["bitsPerSample"],
      sampleRate: fmt.sampleRate,
    },
    channels: fmt.channels,
    data,
  };
}

function readSample(data: Buffer, at: number, format: WavFormat): number {
  if (format.audioFormat === 3) {
    return data.readFloatLE(at);
  }
  switch (format.bitsPerSample) {
    case 8:
      return (data.readUInt8(at) - 128) / 128;
    case 16:
      return data.readInt16LE(at) / 32768;
    case 24:
      return data.readIntLE(at, 3) / 8388608;
    default:
      return data.readInt32LE(at) / 2147483648;
  }
}

function writeSample(out: Buffer, at: number, value: number, format: WavFormat): void {
  if (format.audioFormat === 3) {
    out.writeFloatLE(value, at);
    return;
  }
  const v = Math.max(-1, Math.min(1, value));
  switch (format.bitsPerSample) {
    case 8:
      out.writeUInt8(Math.max(0, Math.min(255, Math.round(v * 128 + 128))), at);
      return;
    case 16:
      out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32768))), at);
      return;
    case 24:
      out.writeIntLE(Math.max(-8388608, Math.min(8388607, Math.round(v * 8388608))), at, 3);
      return;
    default:
      out.writeInt32LE(Math.max(-2147483648, Math.min(2147483647, Math.round(v * 2147483648))), at);
  }
}

export function decodeWav(buffer: Buffer): { channels: AudioPayload[]; format: WavFormat } {
  const { format, channels, data } = parseWav(buffer);
  const bytes = format.bitsPerSample / 8;
  const frames = Math.floor(data.length / (bytes * channels));
  const out = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < channels; c++) {
      out[c]![f] = readSample(data, (f * channels + c) * bytes, format);
    }
  }
  return {
    channels: out.map((samples) => ({ sampleRate: format.sampleRate, samples })),
    format,
  };
}

export function encodeWav(channels: readonly AudioPayload[], format: WavFormat): Buffer {
  const count = channels.length;
  const frames = channels[0]?.samples.length ?? 0;
  const bytes = format.bitsPerSample / 8;
  const dataSize = frames * count * bytes;
  const out = Buffer.alloc(44 + dataSize);
  out.write("RIFF", 0, "ascii");
  out.writeUInt32LE(36 + dataSize, 4);
  out.write("WAVE", 8, "ascii");
  out.write("fmt ", 12, "ascii");
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(format.audioFormat, 20);
  out.writeUInt16LE(count, 22);
  out.writeUInt32LE(format.sampleRate, 24);
  out.writeUInt32LE(format.sampleRate * count * bytes, 28);
  out.writeUInt16LE(count * bytes, 32);
  out.writeUInt16LE(format.bitsPerSample, 34);
  out.write("data", 36, "ascii");
  out.writeUInt32LE(dataSize, 40);
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < count; c++) {
      writeSample(out, 44 + (f * count + c) * bytes, channels[c]!.samples[f] ?? 0, format);
    }
  }
  return out;
}

// --- images ----------------------------------------------------------------

export async function decodeImage(buffer: Buffer): Promise<ImagePayload> {
  const sharp = await loadSharp();
  const { data, info } = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) {
    throw new Error(`unexpected ${info.channels}-channel raster`);
  }
  return {
    width: info.width,
    height: info.height,
    rgba: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
  };
}

export async function encodePng(image: ImagePayload): Promise<Buffer> {
  const sharp = await loadSharp();
  const raw = Buffer.from(image.rgba.buffer, image.rgba.byteOffset, image.rgba.byteLength);
  return await sharp(raw, { raw: { width: image.width, height: image.height, channels: 4 } })
    .png()
    .toBuffer();
}

/** Decode one attachment; never throws (a failure is reported as undecodable). */
export async function decodeMedia(
  buffer: Buffer,
  contentType: string | undefined,
): Promise<DecodedMedia> {
  const kind = mediaKindOf(contentType, buffer);
  if (kind === "other") {
    return { kind: "opaque" };
  }
  try {
    if (kind === "image") {
      return { kind: "image", payload: await decodeImage(buffer) };
    }
    return { kind: "audio", ...decodeWav(buffer) };
  } catch (err) {
    return {
      kind: "undecodable",
      mediaKind: kind,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
