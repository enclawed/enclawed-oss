// Plugin config for the replay sentinel. Tighten-only (settings audit #65):
// a shorter history misses non-consecutive replays, so the shipped 16 is the
// minimum. Out-of-range values refuse the plugin at load.

import { createPluginConfigReader } from "@enclawed/egress-core";

export type ReplaySentinelConfig = { historyPerSink: number };

export const DEFAULT_HISTORY_PER_SINK = 16;

export function resolveReplaySentinelConfig(raw: unknown): ReplaySentinelConfig {
  const r = createPluginConfigReader("egress-replay-sentinel", raw, ["historyPerSink"]);
  return {
    historyPerSink: r.number("historyPerSink", DEFAULT_HISTORY_PER_SINK, {
      integer: true,
      min: DEFAULT_HISTORY_PER_SINK,
      max: 1024,
    }),
  };
}
