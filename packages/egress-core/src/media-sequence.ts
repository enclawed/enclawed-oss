// Media sequence-ID covert-channel defense.
//
// A subtle multi-image covert channel: across a batch of N images the
// attacker chooses the emission order, encoding up to log2(N!) bits in the
// permutation. The per-image scrambler does not see this --- it processes
// each image in isolation. The defense is structural: at the host's media-
// egress chokepoint, BEFORE emission, reorder unsigned media into a
// canonical order that the attacker did not choose.
//
// The canonical order used here is sha256(payload), ascending --- a
// deterministic, content-addressed total order. After reordering, the
// emission sequence is a function of the bytes alone, so the attacker's
// permutation has been replaced by one they cannot pre-image to encode bits
// (sha256 second-preimage resistance). The sequence-ID channel collapses
// completely for unsigned media.
//
// Media a host-installed exemption check accepts bypasses the
// canonicalization: legitimate producers may have semantically-meaningful
// ordering (e.g. paginated chart renderings in a deck) which the runtime must
// not break. The rule is the same as for the per-image scrambler: exempt items
// keep their order, everything else is reordered. With no exemption check
// installed (the open-core default) every item is reordered.
//
// `mediateMediaBatch` (media-egress.ts) applies it at a media-egress
// chokepoint; in the gateway that is the egress mediator's `media_sending`
// handler.

import { isMediaExempt, type MediaExemptionSubject } from "./media-exemption.js";
import { hashAudioPayload, hashImagePayload } from "./media-hash.js";

export type MediaBatchItem = MediaExemptionSubject;

/**
 * Reorder a batch of media items into a canonical, attacker-independent
 * order. Items the host's exemption check accepts keep their relative order
 * (and are emitted first --- they are the trusted stream); every other item
 * is sorted by content hash so the order is a function of the bytes, not the
 * attacker.
 */
export function canonicalMediaOrder(batch: readonly MediaBatchItem[]): MediaBatchItem[] {
  const exempt: MediaBatchItem[] = [];
  const suspect: Array<{ item: MediaBatchItem; hash: string }> = [];
  for (const item of batch) {
    if (isMediaExempt(item)) {
      exempt.push(item);
    } else {
      const hash =
        item.kind === "image" ? hashImagePayload(item.payload) : hashAudioPayload(item.payload);
      suspect.push({ item, hash });
    }
  }
  suspect.sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0));
  return [...exempt, ...suspect.map((u) => u.item)];
}
