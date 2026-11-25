// Plugin config for the cover-traffic service. Fail-closed like the stage
// plugins: an unknown key, a wrong type, an out-of-range interval, or an
// enabled service with no target throws at load, so the plugin loader
// refuses the plugin instead of running a service that silently sends no
// cover (or the wrong cover).

import { createPluginConfigReader } from "@enclawed/egress-core";
import type { CoverTrafficMode } from "./scheduler.js";
import { defaultCoverTrafficConfig, type CoverTrafficConfig } from "./service.js";

const MODES: readonly CoverTrafficMode[] = ["constant", "poisson"];
/** Shortest mean interval: below this the filler itself floods the channel. */
const MIN_INTERVAL_MS = 1_000;
/**
 * Longest mean interval: the shipped 60 s (settings audit #66). A longer
 * interval (up to a day used to be accepted) means almost no cover, so it is
 * refused; a shorter one (more cover) is accepted.
 */
const MAX_INTERVAL_MS = defaultCoverTrafficConfig.meanIntervalMs;
/** Longest filler text. */
const MAX_COVER_CONTENT_CHARS = 4_000;

export function resolveCoverTrafficConfig(raw: unknown): CoverTrafficConfig {
  const r = createPluginConfigReader("egress-cover-traffic", raw, [
    "enabled",
    "mode",
    "meanIntervalMs",
    "coverContent",
    "target",
  ]);
  const enabled = r.bool("enabled", defaultCoverTrafficConfig.enabled);
  const mode = r.oneOf("mode", MODES, defaultCoverTrafficConfig.mode);
  const meanIntervalMs = r.number("meanIntervalMs", defaultCoverTrafficConfig.meanIntervalMs, {
    integer: true,
    min: MIN_INTERVAL_MS,
    max: MAX_INTERVAL_MS,
  });
  const coverContent = r.optionalString("coverContent") ?? defaultCoverTrafficConfig.coverContent;
  if (coverContent.length > MAX_COVER_CONTENT_CHARS) {
    r.fail(`coverContent must be at most ${MAX_COVER_CONTENT_CHARS} characters`);
  }
  let target: CoverTrafficConfig["target"];
  if (r.has("target")) {
    const t = r.section("target", ["to", "channel"]);
    const to = t.optionalString("to");
    if (!to) {
      r.fail("target.to is required when target is set");
    }
    const channel = t.optionalString("channel");
    target = { to: to as string, ...(channel ? { channel } : {}) };
  }
  if (enabled && !target) {
    r.fail("enabled is true but no target is configured (set target.to)");
  }
  return { enabled, mode, meanIntervalMs, coverContent, ...(target ? { target } : {}) };
}
