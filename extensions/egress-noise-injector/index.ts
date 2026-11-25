import { registerEgressStage } from "@enclawed/egress-core";
import { definePluginEntry } from "@enclawed/plugin-sdk/plugin-entry";
import { resolveNoiseOptions } from "./src/config.js";
import { buildNoiseInjectorStage } from "./src/stage.js";

export default definePluginEntry({
  id: "egress-noise-injector",
  name: "Egress Noise Injector",
  description:
    "Semantic noise-injection stage: collapses visible covert-encoding " +
    "dimensions (whitespace runs, typographic variants, repeated " +
    "punctuation) so meaning is preserved but hidden bits are destroyed.",
  register(api) {
    // Validated before registering: a bad value refuses the plugin.
    registerEgressStage(buildNoiseInjectorStage(resolveNoiseOptions(api.pluginConfig)));
  },
});
