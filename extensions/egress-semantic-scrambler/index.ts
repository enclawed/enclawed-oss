import { registerEgressStage } from "@enclawed/egress-core";
import { definePluginEntry } from "@enclawed/plugin-sdk/plugin-entry";
import { resolveSemanticScramblerConfig } from "./src/config.js";
import { buildSemanticScramblerStage } from "./src/stage.js";

export default definePluginEntry({
  id: "egress-semantic-scrambler",
  name: "Egress Semantic Scrambler",
  description:
    "Semantic-scrambler stage: collapses linguistic covert-encoding " +
    "dimensions — synonym choice, contraction form, active/passive voice — " +
    "by deterministically mapping each linguistic equivalence class to one " +
    "canonical representative, destroying the word-choice channel. The " +
    "deterministic alternative to the egress-llm-scrambler; a production " +
    "pipeline enables at most one. Set config `enabled: false` to disable.",
  register(api) {
    // Independently selectable: the deterministic and LLM scramblers are
    // alternative linguistic-disruption stages — running both is redundant.
    // An operator disables this one by setting its plugin config `enabled`
    // to false; the LLM scrambler is disabled the same way, independently.
    // Validated before registering: a bad value refuses the plugin.
    const config = resolveSemanticScramblerConfig(api.pluginConfig);
    if (!config.enabled) {
      return;
    }
    registerEgressStage(buildSemanticScramblerStage(config.options));
  },
});
