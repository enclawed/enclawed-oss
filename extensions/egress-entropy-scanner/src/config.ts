// Plugin config -> entropy-scanner thresholds. Tighten-only (settings audit
// #64): the shipped thresholds are the loosest allowed, because a longer
// minimum blob, a higher entropy threshold or a higher incompressible ratio
// lets a larger encoded blob through unseen. A value past the default, or out
// of range, refuses the plugin at load.

import { createPluginConfigReader } from "@enclawed/egress-core";
import { defaultEntropyOptions, type EntropyOptions } from "./entropy.js";

export function resolveEntropyOptions(raw: unknown): EntropyOptions {
  const r = createPluginConfigReader("egress-entropy-scanner", raw, [
    "minBlobLength",
    "entropyThresholdBits",
    "incompressibleRatio",
  ]);
  const d = defaultEntropyOptions;
  return {
    minBlobLength: r.number("minBlobLength", d.minBlobLength, {
      integer: true,
      min: 8,
      max: d.minBlobLength,
    }),
    entropyThresholdBits: r.number("entropyThresholdBits", d.entropyThresholdBits, {
      above: 0,
      max: d.entropyThresholdBits,
    }),
    incompressibleRatio: r.number("incompressibleRatio", d.incompressibleRatio, {
      above: 0,
      max: d.incompressibleRatio,
    }),
  };
}
