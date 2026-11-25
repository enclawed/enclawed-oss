// Media chokepoint: outbound attachments (`media_sending`).
//
// The gateway loads each attachment of an outbound message under the
// sender's media-access policy and hands the bytes to this handler. Images
// and WAV audio are decoded, run through every registered media scrambler
// (`@enclawed/egress-core` media registry, per-scrambler enforce/audit/off),
// and the batch is put into canonical content-hash order
// (`canonicalMediaOrder`, stage id `egress-media-order`). Changed payloads are
// re-encoded and returned as replacements; the gateway saves and sends them.
//
// Fail closed: an image or audio attachment that cannot be decoded while a
// scrambler for its kind is enforcing cancels the message, as does an
// enforcing scrambler that throws. Attachments that are neither image nor
// audio (video, documents) have no scrambler; they keep their bytes and, when
// ordering is enforced, follow the decoded media in SHA-256 order.

import { createHash } from "node:crypto";
import {
  getMediaScramblers,
  mediateMediaBatch,
  STAGE_IDS,
  type AudioPayload,
  type AuditBuffer,
  type EgressMode,
  type ImagePayload,
  type MediaBatchItem,
} from "@enclawed/egress-core";
import type { EnclawedPluginApi } from "@enclawed/plugin-sdk/plugin-entry";
import { effectiveStageMode, type EgressMediatorConfig } from "./config.js";
import { decodeMedia, encodePng, encodeWav, type DecodedMedia } from "./media-codec.js";

type HookMedia = { source: string; buffer: Buffer; contentType?: string; fileName?: string };
type OutMedia = { buffer: Buffer; contentType?: string; fileName?: string };

type MediaApi = Pick<EnclawedPluginApi, "on" | "logger">;

/** One attachment: its position, original bytes and decoded form. */
type Slot = {
  index: number;
  original: HookMedia;
  decoded: DecodedMedia;
};

const sha256 = (buffer: Buffer): string => createHash("sha256").update(buffer).digest("hex");

function pngName(fileName: string | undefined): string | undefined {
  if (!fileName) {
    return undefined;
  }
  return `${fileName.replace(/\.[A-Za-z0-9]{1,5}$/u, "")}.png`;
}

/** One payload that stands for a whole attachment in the ordering pass. */
function orderingPayload(
  slot: Slot,
  channels: readonly AudioPayload[],
): MediaBatchItem & { slot: Slot } {
  if (slot.decoded.kind === "image") {
    return { kind: "image", payload: slot.decoded.payload, slot };
  }
  const total = channels.reduce((n, c) => n + c.samples.length, 0);
  const samples = new Float32Array(total);
  let at = 0;
  for (const channel of channels) {
    samples.set(channel.samples, at);
    at += channel.samples.length;
  }
  return { kind: "audio", payload: { sampleRate: channels[0]?.sampleRate ?? 0, samples }, slot };
}

export function registerMediaChokepoint(
  api: MediaApi,
  config: EgressMediatorConfig,
  audit: AuditBuffer,
): void {
  if (!config.egress.enabled || !config.media.enabled) {
    return;
  }
  const modeFor = (stageId: string): EgressMode => effectiveStageMode(config, stageId);

  const active = (): boolean =>
    getMediaScramblers().length > 0 || modeFor(STAGE_IDS.mediaOrder) === "enforce";

  const enforcingKinds = (): Set<string> =>
    new Set(
      getMediaScramblers()
        .filter((s) => modeFor(s.id) === "enforce")
        .map((s) => s.kind),
    );

  api.on(
    "media_sending",
    async (event, hookCtx) => {
      if (!active() || event.media.length === 0) {
        return undefined;
      }
      const sinkId = `media:${hookCtx?.conversationId ?? hookCtx?.channelId ?? event.to}`;
      const record = (finding: Parameters<AuditBuffer["sink"]>[1]) => audit.sink(sinkId, finding);

      // Decode sequentially to bound memory on large batches.
      const slots: Slot[] = [];
      for (const [index, original] of event.media.entries()) {
        slots.push({
          index,
          original,
          decoded: await decodeMedia(original.buffer, original.contentType),
        });
      }

      const strict = enforcingKinds();
      for (const slot of slots) {
        if (slot.decoded.kind !== "undecodable") {
          continue;
        }
        const enforce = strict.has(slot.decoded.mediaKind);
        record({
          stageId: "egress-mediator",
          severity: enforce ? "high" : "low",
          code: "media-undecodable",
          message: `cannot decode ${slot.decoded.mediaKind} attachment #${slot.index} (${slot.decoded.reason})`,
        });
        if (enforce) {
          api.logger.warn(
            `egress-mediator: blocked outbound media to ${sinkId} (undecodable ${slot.decoded.mediaKind}: ${slot.decoded.reason})`,
          );
          return { cancel: true };
        }
      }

      // Pass 1: scramble. Every image, and every channel of every WAV, is one
      // item; ordering is off here so items come back in input order.
      const decodable = slots.filter(
        (s) => s.decoded.kind === "image" || s.decoded.kind === "audio",
      );
      const flat: Array<MediaBatchItem & { slot: Slot }> = [];
      for (const slot of decodable) {
        if (slot.decoded.kind === "image") {
          flat.push({ kind: "image", payload: slot.decoded.payload, slot });
        } else if (slot.decoded.kind === "audio") {
          for (const channel of slot.decoded.channels) {
            flat.push({ kind: "audio", payload: channel, slot });
          }
        }
      }
      const scrambled = mediateMediaBatch(flat, {
        modeFor: (id) => (id === STAGE_IDS.mediaOrder ? "off" : modeFor(id)),
        audit: record,
      });
      if (scrambled.cancelled) {
        api.logger.warn(
          `egress-mediator: blocked outbound media to ${sinkId} (${scrambled.reason})`,
        );
        return { cancel: true };
      }
      const payloadsBySlot = new Map<Slot, Array<ImagePayload | AudioPayload>>();
      for (const item of scrambled.items) {
        const list = payloadsBySlot.get(item.slot) ?? [];
        list.push(item.payload);
        payloadsBySlot.set(item.slot, list);
      }

      // Pass 2: canonical order over whole attachments.
      const ordered = mediateMediaBatch(
        decodable.map((slot) =>
          orderingPayload(slot, (payloadsBySlot.get(slot) ?? []) as AudioPayload[]),
        ),
        { modeFor, audit: record, scramblers: [] },
      );
      if (ordered.cancelled) {
        return { cancel: true };
      }
      const orderEnforced = modeFor(STAGE_IDS.mediaOrder) === "enforce";
      const others = slots.filter((s) => !decodable.includes(s));
      const sequence: Slot[] = orderEnforced
        ? [
            ...ordered.items.map((item) => item.slot),
            ...others.toSorted((a, b) => {
              const ha = sha256(a.original.buffer);
              const hb = sha256(b.original.buffer);
              return ha < hb ? -1 : ha > hb ? 1 : 0;
            }),
          ]
        : slots;

      const rewritten = (slot: Slot): boolean => {
        const after = payloadsBySlot.get(slot);
        const decoded = slot.decoded;
        if (!after) {
          return false;
        }
        if (decoded.kind === "image") {
          return after[0] !== decoded.payload;
        }
        return decoded.kind === "audio" && after.some((p, i) => p !== decoded.channels[i]);
      };
      const moved = sequence.some((slot, i) => slot !== slots[i]);
      if (!moved && !slots.some(rewritten)) {
        return undefined;
      }

      const out: OutMedia[] = [];
      for (const slot of sequence) {
        const { original, decoded } = slot;
        if (!rewritten(slot)) {
          out.push({
            buffer: original.buffer,
            ...(original.contentType ? { contentType: original.contentType } : {}),
            ...(original.fileName ? { fileName: original.fileName } : {}),
          });
          continue;
        }
        const after = payloadsBySlot.get(slot)!;
        if (decoded.kind === "image") {
          const name = pngName(original.fileName);
          out.push({
            buffer: await encodePng(after[0] as ImagePayload),
            contentType: "image/png",
            ...(name ? { fileName: name } : {}),
          });
        } else if (decoded.kind === "audio") {
          out.push({
            buffer: encodeWav(after as AudioPayload[], decoded.format),
            contentType: "audio/wav",
            ...(original.fileName ? { fileName: original.fileName } : {}),
          });
        }
      }
      return { media: out };
    },
    { priority: 100 },
  );
}
