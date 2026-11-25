import { registerEgressStage } from "@enclawed/egress-core";
import { definePluginEntry } from "@enclawed/plugin-sdk/plugin-entry";
import { resolveBehavioralOptions } from "./src/config.js";
import { buildBehavioralInvariantsStage } from "./src/stage.js";

export default definePluginEntry({
  id: "egress-behavioral-invariants",
  name: "Egress Behavioral Invariants",
  description:
    "Stateful side-channel shaping stage: enforces per-sink rate/volume " +
    "invariants, quantizes send timing to a fixed grid with jitter, and " +
    "flags near-periodic egress as a suspected timing channel.",
  register(api) {
    // Validated before registering: a bad value refuses the plugin.
    registerEgressStage(buildBehavioralInvariantsStage(resolveBehavioralOptions(api.pluginConfig)));
  },
});
