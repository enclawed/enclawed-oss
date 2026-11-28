import { definePluginEntry } from "@enclawed/plugin-sdk/plugin-entry";
import { resolveCoverTrafficConfig } from "./src/config.js";
import { createCoverTrafficService } from "./src/service.js";

export default definePluginEntry({
  id: "egress-cover-traffic",
  name: "Egress Cover Traffic",
  description:
    "Constant-rate / Poisson cover-traffic service: keeps an idle channel " +
    "busy with filler so the presence and rate of real egress carry no " +
    "information. Opt-in and disabled by default.",
  register(api) {
    // Resolved once at load: an invalid config refuses the plugin here.
    const config = resolveCoverTrafficConfig(api.pluginConfig);
    const service = createCoverTrafficService(() => config);
    api.registerService(service);
    // Real traffic is its own cover: every delivered channel message resets
    // the idle clock, so filler is suppressed while the agent is active.
    api.on("message_sent", (event) => {
      if (event.success) {
        service.noteRealEgress();
      }
    });
  },
});
