// Media-egress pipeline: the media counterpart of `runEgressPipeline`.
//
// A host chokepoint that sends media (the egress mediator's `media_sending`
// handler in the gateway, or an application's own send path) hands a batch of
// decoded images and audio clips to `mediateMediaBatch`. Each item runs
// through every registered media scrambler of its kind, then the batch is put
// into canonical content-hash order (`canonicalMediaOrder`), which removes
// the order-of-emission channel.
//
// Modes follow the text pipeline: each scrambler's id, and
// `STAGE_IDS.mediaOrder` for the ordering step, resolves to enforce, audit or
// off. Audit records what enforce would have changed and leaves the batch as
// it was. A scrambler that throws while enforcing cancels the whole batch
// (fail closed); while auditing it is skipped.

import { STAGE_IDS } from "./config.js";
import { canonicalMediaOrder, type MediaBatchItem } from "./media-sequence.js";
import {
  getMediaScramblers,
  type AudioPayload,
  type ImagePayload,
  type MediaScrambler,
} from "./media.js";
import type { EgressMode, Finding } from "./types.js";

export type MediaEgressOptions = {
  /** Resolve the effective mode for a scrambler id or `STAGE_IDS.mediaOrder`. */
  modeFor: (stageId: string) => EgressMode;
  /** Optional external audit sink (in addition to the returned findings). */
  audit?: (finding: Finding) => void;
  /** Fixed scrambler list. When omitted the shared media registry is drained. */
  scramblers?: readonly MediaScrambler[];
};

export type MediaEgressResult<T extends MediaBatchItem> =
  | { cancelled: true; reason: string; findings: Finding[] }
  | {
      cancelled: false;
      /** The batch after enforcing scramblers and ordering, as new item objects. */
      items: T[];
      /** Whether any payload or the order changed. */
      changed: boolean;
      findings: Finding[];
    };

/** Number of samples (or RGBA bytes) that differ between two payloads. */
function countChanged(before: MediaBatchItem, after: ImagePayload | AudioPayload): number {
  const a = before.kind === "image" ? before.payload.rgba : before.payload.samples;
  const b =
    before.kind === "image" ? (after as ImagePayload).rgba : (after as AudioPayload).samples;
  if (a.length !== b.length) {
    return Math.max(a.length, b.length);
  }
  let changed = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      changed++;
    }
  }
  return changed;
}

function applyScrambler(
  item: MediaBatchItem,
  scrambler: MediaScrambler,
): ImagePayload | AudioPayload {
  if (scrambler.kind === "image" && item.kind === "image") {
    return scrambler.scramble(item.payload);
  }
  if (scrambler.kind === "audio" && item.kind === "audio") {
    return scrambler.scramble(item.payload);
  }
  return item.payload;
}

/**
 * Scramble and canonically order one outbound media batch. Items are matched
 * by object identity across the ordering step, so callers may attach their
 * own fields (for example the original file name) to each item.
 */
export function mediateMediaBatch<T extends MediaBatchItem>(
  batch: readonly T[],
  opts: MediaEgressOptions,
): MediaEgressResult<T> {
  const findings: Finding[] = [];
  const collect = (finding: Finding): void => {
    findings.push(finding);
    opts.audit?.(finding);
  };
  const scramblers = (opts.scramblers ?? getMediaScramblers()).toSorted((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  let changed = false;
  const items: T[] = [];

  for (const [index, original] of batch.entries()) {
    let current: T = original;
    for (const scrambler of scramblers) {
      if (scrambler.kind !== current.kind) {
        continue;
      }
      const mode = opts.modeFor(scrambler.id);
      if (mode === "off") {
        continue;
      }
      let next: ImagePayload | AudioPayload;
      try {
        next = applyScrambler(current, scrambler);
      } catch (err) {
        collect({
          stageId: scrambler.id,
          severity: "high",
          code: "stage-error",
          message: `media scrambler ${scrambler.id} threw: ${err instanceof Error ? err.message : String(err)}`,
        });
        if (mode === "enforce") {
          return { cancelled: true, reason: `${scrambler.id}: internal error`, findings };
        }
        continue;
      }
      const diff = countChanged(current, next);
      if (diff === 0) {
        continue;
      }
      if (mode === "enforce") {
        collect({
          stageId: scrambler.id,
          severity: "medium",
          code: "media-scrambled",
          message: `${scrambler.id} rewrote ${current.kind} #${index} (${diff} values changed)`,
          detail: { index, changedValues: diff },
        });
        // Built from `original`: only the payload differs between scrambler passes.
        current = { ...original, payload: next } as T;
        changed = true;
      } else {
        collect({
          stageId: scrambler.id,
          severity: "info",
          code: "rewrite-suppressed-audit",
          message: `${scrambler.id} would rewrite ${current.kind} #${index} (${diff} values; audit mode, not applied)`,
          detail: { index, changedValues: diff },
        });
      }
    }
    items.push(current);
  }

  const orderMode = opts.modeFor(STAGE_IDS.mediaOrder);
  if (orderMode !== "off" && items.length > 1) {
    const ordered = canonicalMediaOrder(items) as T[];
    const moved = ordered.some((item, i) => item !== items[i]);
    if (moved) {
      // Up to log2(N!) bits could ride on the order the sender chose.
      let bits = 0;
      for (let n = 2; n <= items.length; n++) {
        bits += Math.log2(n);
      }
      collect({
        stageId: STAGE_IDS.mediaOrder,
        severity: orderMode === "enforce" ? "low" : "info",
        code: orderMode === "enforce" ? "media-reordered" : "rewrite-suppressed-audit",
        message:
          orderMode === "enforce"
            ? `reordered ${items.length} media items into canonical content-hash order`
            : `would reorder ${items.length} media items into canonical order (audit mode, not applied)`,
        estimatedBits: Math.round(bits),
      });
      if (orderMode === "enforce") {
        return { cancelled: false, items: ordered, changed: true, findings };
      }
    }
  }
  return { cancelled: false, items, changed, findings };
}
