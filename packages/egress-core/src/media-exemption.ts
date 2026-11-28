// Media-exemption seam.
//
// The media scramblers (audio, image) are aggressive by necessity: they zero
// spectral content outside the audible band and requantize pixel bit depth.
// No content-based classifier can reliably tell real speech from audible-band
// sonified data, so the open core does not try. By default EVERY media payload
// is treated as suspect and scrambled, and every batch is put into canonical
// content-hash order. That default is fail-secure: nothing is exempt unless a
// host says so.
//
// A host that has its own way of establishing that a payload was produced
// legitimately (for example, a signed provenance record checked against a
// trust set the host controls) installs a check here. A payload the check
// accepts passes through the media scramblers unchanged and keeps its
// relative position in a batch. The open core ships no such check and never
// interprets `ImagePayload.exemption` / `AudioPayload.exemption`; it only
// forwards the payload to the installed check.
//
// State lives on a `globalThis` `Symbol.for` slot so one installation is seen
// by every extension that bundles this package.

import type { AudioPayload, ImagePayload } from "./media.js";

export type MediaExemptionSubject =
  | { kind: "image"; payload: ImagePayload }
  | { kind: "audio"; payload: AudioPayload };

/**
 * Returns true only when the payload is known-legitimate and may skip
 * scrambling. Must be pure and fast; it runs on every media egress.
 */
export type MediaExemptionCheck = (subject: MediaExemptionSubject) => boolean;

type MediaExemptionState = { check: MediaExemptionCheck | null };

const EXEMPTION_KEY = Symbol.for("enclawed.egress-core.media-exemption");

function getState(): MediaExemptionState {
  const globals = globalThis as unknown as Record<symbol, MediaExemptionState | undefined>;
  let state = globals[EXEMPTION_KEY];
  if (!state) {
    state = { check: null };
    globals[EXEMPTION_KEY] = state;
  }
  return state;
}

/** Install the host's media-exemption check. Replaces any previous check. */
export function setMediaExemptionCheck(check: MediaExemptionCheck): void {
  getState().check = check;
}

/** Whether a host media-exemption check is installed. */
export function hasMediaExemptionCheck(): boolean {
  return getState().check !== null;
}

/**
 * Whether a payload is exempt from media scrambling. False when no check is
 * installed, and false when the check throws (fail-secure: scramble).
 */
export function isMediaExempt(subject: MediaExemptionSubject): boolean {
  const { check } = getState();
  if (!check) {
    return false;
  }
  try {
    // Only a literal `true` exempts: a check returning a truthy non-boolean
    // (a misbehaving host check) must not open the exemption.
    const verdict: unknown = check(subject);
    return verdict === true;
  } catch {
    return false;
  }
}

/** Test-only: remove the installed check. */
export function resetMediaExemption(): void {
  getState().check = null;
}
