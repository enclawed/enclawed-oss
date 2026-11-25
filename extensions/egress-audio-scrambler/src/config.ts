// Plugin config -> audio scrambler options. Tighten-only (settings audit #60):
// the shipped band (20 Hz to 20 kHz) and perceptual floor (0.003, about
// -50 dB) are the loosest allowed. A wider band keeps ultrasonic or
// infrasonic carriers, and a lower floor keeps sub-perceptual stego, so a
// value past the default is refused. A narrower band or a higher floor
// (stricter) is accepted. An unknown key, a wrong type or an invalid value
// refuses the plugin at load rather than silently weakening the scrambler.

import { createPluginConfigReader } from "@enclawed/egress-core";
import { type AudioScramblerOptions, defaultAudioScramblerOptions } from "./scrambler.js";

export type AudioScramblerConfig = {
  enabled?: boolean;
  minHz?: number;
  maxHz?: number;
  /** Floor as a fraction of the loudest bin. */
  perceptualFloor?: number;
  /** Same floor in dB relative to the loudest bin, e.g. -50. Easier to read. */
  perceptualFloorDb?: number;
};

const ID = "egress-audio-scrambler";
const KEYS = ["enabled", "minHz", "maxHz", "perceptualFloor", "perceptualFloorDb"] as const;
const D = defaultAudioScramblerOptions;
/** Loosest floor in dB: -50 dB (0.00316), just above the shipped 0.003 fraction. */
export const MIN_PERCEPTUAL_FLOOR_DB = -50;

/** Whether the plugin config asks for the stage (validates the whole config). */
export function resolveAudioScramblerEnabled(config: unknown): boolean {
  const r = createPluginConfigReader(ID, config, KEYS);
  resolveAudioScramblerOptions(config);
  return r.bool("enabled", true);
}

export function resolveAudioScramblerOptions(config: unknown): AudioScramblerOptions {
  const r = createPluginConfigReader(ID, config, KEYS);
  const opts = { ...D };
  if (r.has("perceptualFloor") && r.has("perceptualFloorDb")) {
    r.fail("set perceptualFloor or perceptualFloorDb, not both");
  }
  const db = r.optionalNumber("perceptualFloorDb", { min: MIN_PERCEPTUAL_FLOOR_DB, max: 0 });
  const fraction = r.optionalNumber("perceptualFloor", { min: D.perceptualFloor, below: 1 });
  if (db !== undefined) {
    opts.perceptualFloor = 10 ** (db / 20);
  } else if (fraction !== undefined) {
    opts.perceptualFloor = fraction;
  }
  opts.minHz = r.number("minHz", D.minHz, { min: D.minHz, below: D.maxHz });
  opts.maxHz = r.number("maxHz", D.maxHz, { above: D.minHz, max: D.maxHz });
  if (opts.minHz >= opts.maxHz) {
    r.fail("minHz must be below maxHz");
  }
  return opts;
}
