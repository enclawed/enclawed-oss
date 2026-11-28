// Plugin config for the timing scrambler. Tighten-only (settings audit #61):
// the random spread (maxDelayMs - minDelayMs) is at least the shipped 750 ms,
// because a narrower spread (maxDelayMs=0, or min equal to max) leaves the
// timing channel open. A bad value, or a range narrower than that, refuses the
// plugin at load.

import { createPluginConfigReader } from "@enclawed/egress-core";
import { defaultTimingScramblerOptions, type TimingScramblerOptions } from "./timing.js";

export type TimingScramblerConfig = { enabled: boolean; options: TimingScramblerOptions };

const MAX_DELAY_MS = 600_000;
/** The shortest random spread allowed: the shipped default range. */
export const MIN_DELAY_SPREAD_MS =
  defaultTimingScramblerOptions.maxDelayMs - defaultTimingScramblerOptions.minDelayMs;

export function resolveTimingScramblerConfig(raw: unknown): TimingScramblerConfig {
  const r = createPluginConfigReader("egress-timing-scrambler", raw, [
    "enabled",
    "minDelayMs",
    "maxDelayMs",
  ]);
  const bounds = { integer: true, min: 0, max: MAX_DELAY_MS };
  const minDelayMs = r.number("minDelayMs", defaultTimingScramblerOptions.minDelayMs, bounds);
  const maxDelayMs = r.number("maxDelayMs", defaultTimingScramblerOptions.maxDelayMs, bounds);
  if (minDelayMs > maxDelayMs) {
    r.fail(`minDelayMs (${minDelayMs}) must not exceed maxDelayMs (${maxDelayMs})`);
  }
  if (maxDelayMs - minDelayMs < MIN_DELAY_SPREAD_MS) {
    r.fail(
      `maxDelayMs - minDelayMs (${maxDelayMs - minDelayMs} ms) must be at least ${MIN_DELAY_SPREAD_MS} ms`,
    );
  }
  return { enabled: r.bool("enabled", true), options: { minDelayMs, maxDelayMs } };
}
