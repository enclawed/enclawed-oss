import { registerEgressStage } from "@enclawed/egress-core";
import { definePluginEntry } from "@enclawed/plugin-sdk/plugin-entry";
import { resolveTaintTrackerConfig } from "./src/config.js";
import { buildTaintTrackerStage } from "./src/stage.js";

export default definePluginEntry({
  id: "egress-taint-tracker",
  name: "Egress Taint Tracker",
  description:
    "Provenance / taint-tracking stage: blocks outbound payloads carrying " +
    "credential material or values previously tagged as sensitive, and " +
    "reports generic PII. Complements entropy scanning by catching known " +
    "low-entropy sensitive values.",
  register(api) {
    // Validated before registering: `enabled: false` or a bad value refuses the plugin.
    resolveTaintTrackerConfig(api.pluginConfig);
    registerEgressStage(buildTaintTrackerStage());
  },
});
