// Plugin config -> behavioral-invariant options. All seven declared options,
// including timing quantization and constant-rate paced release, are read
// here. A bad value refuses the plugin at load; so does `jitterMs` without
// `timingQuantumMs`, because jitter only applies on top of quantization and
// would otherwise be silently ignored.

import { createPluginConfigReader } from "@enclawed/egress-core";
import { defaultBehavioralOptions, type BehavioralOptions } from "./invariants.js";

const DAY_MS = 86_400_000;

export function resolveBehavioralOptions(raw: unknown): BehavioralOptions {
  const r = createPluginConfigReader("egress-behavioral-invariants", raw, [
    "windowMs",
    "maxMessagesPerWindow",
    "maxBytesPerWindow",
    "minIntervalMs",
    "timingQuantumMs",
    "jitterMs",
    "releaseCadenceMs",
  ]);
  const d = defaultBehavioralOptions;
  const ms = { integer: true, min: 0, max: DAY_MS };
  const opts: BehavioralOptions = {
    ...d,
    // Tighten-only: the shipped limits are the loosest allowed. A shorter
    // window or a higher count/byte limit would raise the rate and volume a
    // destination may get, so it is refused.
    windowMs: r.number("windowMs", d.windowMs, {
      integer: true,
      min: d.windowMs,
      max: DAY_MS,
    }),
    maxMessagesPerWindow: r.number("maxMessagesPerWindow", d.maxMessagesPerWindow, {
      integer: true,
      min: 1,
      max: d.maxMessagesPerWindow,
    }),
    maxBytesPerWindow: r.number("maxBytesPerWindow", d.maxBytesPerWindow, {
      integer: true,
      min: 1,
      max: d.maxBytesPerWindow,
    }),
    minIntervalMs: r.number("minIntervalMs", d.minIntervalMs, ms),
    timingQuantumMs: r.number("timingQuantumMs", d.timingQuantumMs, ms),
    jitterMs: r.number("jitterMs", d.jitterMs, ms),
    releaseCadenceMs: r.number("releaseCadenceMs", d.releaseCadenceMs, ms),
  };
  if (opts.jitterMs > 0 && opts.timingQuantumMs === 0) {
    r.fail("jitterMs applies only with timingQuantumMs > 0");
  }
  return opts;
}
