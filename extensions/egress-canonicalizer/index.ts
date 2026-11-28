import { registerEgressStage } from "@enclawed/egress-core";
import { definePluginEntry } from "@enclawed/plugin-sdk/plugin-entry";
import { resolveCanonicalizerOptions } from "./src/config.js";
import { buildCanonicalizerStage } from "./src/stage.js";

export default definePluginEntry({
  id: "egress-canonicalizer",
  name: "Egress Canonicalizer",
  description:
    "Lossless output canonicalization stage: strips invisible/tag/zero-width " +
    "and bidirectional stego carriers, folds mixed-script homoglyphs, " +
    "normalizes Unicode (NFC) and whitespace, and canonicalizes JSON key " +
    "ordering. Registers into the egress reference monitor.",
  register(api) {
    // Validated before registering: a bad value refuses the plugin.
    registerEgressStage(buildCanonicalizerStage(resolveCanonicalizerOptions(api.pluginConfig)));
  },
});
