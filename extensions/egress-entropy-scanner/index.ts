import { registerEgressStage } from "@enclawed/egress-core";
import { definePluginEntry } from "@enclawed/plugin-sdk/plugin-entry";
import { resolveEntropyOptions } from "./src/config.js";
import { buildEntropyScannerStage } from "./src/stage.js";

export default definePluginEntry({
  id: "egress-entropy-scanner",
  name: "Egress Entropy Scanner",
  description:
    "Payload content analysis stage: measures Shannon entropy, detects " +
    "base64/hex blobs and incompressible runs, and charges the estimated " +
    "covert capacity against the per-sink ledger.",
  register(api) {
    // Validated before registering: a bad value refuses the plugin.
    registerEgressStage(buildEntropyScannerStage(resolveEntropyOptions(api.pluginConfig)));
  },
});
