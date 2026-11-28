// Canonical content hashes for decoded media payloads.
//
// Used to give a batch of media items an attacker-independent order (see
// `media-sequence.ts`) and available to a host-installed exemption check that
// wants to bind its evidence to the exact payload bytes.

import { createHash } from "node:crypto";
import type { AudioPayload, ImagePayload } from "./media.js";

/** SHA-256 hex of the canonical bytes of an image payload (width, height, RGBA). */
export function hashImagePayload(image: Pick<ImagePayload, "width" | "height" | "rgba">): string {
  const header = Buffer.from(`image:${image.width}x${image.height}:`);
  const pixels = Buffer.from(image.rgba.buffer, image.rgba.byteOffset, image.rgba.byteLength);
  return createHash("sha256").update(header).update(pixels).digest("hex");
}

/** SHA-256 hex of the canonical bytes of an audio payload (sampleRate, Float32 samples). */
export function hashAudioPayload(audio: Pick<AudioPayload, "sampleRate" | "samples">): string {
  const header = Buffer.from(`audio:${audio.sampleRate}:${audio.samples.length}:`);
  const samples = Buffer.from(
    audio.samples.buffer,
    audio.samples.byteOffset,
    audio.samples.byteLength,
  );
  return createHash("sha256").update(header).update(samples).digest("hex");
}
