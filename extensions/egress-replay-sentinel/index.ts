import { registerEgressStage } from "@enclawed/egress-core";
import { definePluginEntry } from "@enclawed/plugin-sdk/plugin-entry";
import { resolveReplaySentinelConfig } from "./src/config.js";
import { createReplaySentinel } from "./src/replay.js";
import { buildReplaySentinelStage } from "./src/stage.js";

export default definePluginEntry({
  id: "egress-replay-sentinel",
  name: "Egress Replay Sentinel",
  description:
    "Replay-divergence detector: flags payloads that repeat a prior message " +
    "with cosmetic-only variation — the diff is a candidate covert channel. " +
    "Observe-only; charges the estimate against the per-sink ledger.",
  register(api) {
    // Validated before registering: a bad value refuses the plugin.
    const config = resolveReplaySentinelConfig(api.pluginConfig);
    registerEgressStage(
      buildReplaySentinelStage({
        sentinel: createReplaySentinel({ historyPerSink: config.historyPerSink }),
      }),
    );
  },
});
