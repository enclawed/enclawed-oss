import { registerEgressStage } from "@enclawed/egress-core";
import { definePluginEntry } from "@enclawed/plugin-sdk/plugin-entry";
import { resolveLlmScramblerConfig } from "./src/config.js";
import { buildLlmScramblerStage } from "./src/stage.js";

export default definePluginEntry({
  id: "egress-llm-scrambler",
  name: "Egress LLM Scrambler",
  description:
    "Model-backed semantic-scrambler stage: rephrases outbound text through " +
    "the host LLM under a fixed, non-configurable instruction, regenerating " +
    "the payload so every linguistic covert encoding is discarded. Inert " +
    "until the host wires a model completer. The model-backed alternative " +
    "to the deterministic egress-semantic-scrambler; a production pipeline " +
    "enables at most one. Set config `enabled: false` to disable.",
  register(api) {
    // Independently selectable: the LLM and deterministic scramblers are
    // alternative linguistic-disruption stages — running both is redundant.
    // An operator disables this one by setting its plugin config `enabled`
    // to false; the deterministic scrambler is disabled the same way,
    // independently.
    // Validated before registering: a bad value refuses the plugin.
    const config = resolveLlmScramblerConfig(api.pluginConfig);
    if (!config.enabled) {
      return;
    }
    registerEgressStage(buildLlmScramblerStage(config.options));
  },
});
