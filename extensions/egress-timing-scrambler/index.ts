import { registerEgressStage } from "@enclawed/egress-core";
import { definePluginEntry } from "@enclawed/plugin-sdk/plugin-entry";
import { resolveTimingScramblerConfig } from "./src/config.js";
import { buildTimingScramblerStage } from "./src/stage.js";

export default definePluginEntry({
  id: "egress-timing-scrambler",
  name: "Egress Timing Scrambler",
  description:
    "Timing-interval scrambler: injects a completely random, " +
    "cryptographically drawn delay before every outbound message so the " +
    "observed inter-message interval carries no attacker-chosen signal. The " +
    "cheap always-on complement to the behavioral stage's paced release.",
  register(api) {
    // Validated before registering: a bad value refuses the plugin.
    const config = resolveTimingScramblerConfig(api.pluginConfig);
    if (!config.enabled) {
      return;
    }
    registerEgressStage(buildTimingScramblerStage(config.options));
  },
});
