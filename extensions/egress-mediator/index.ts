import { definePluginEntry } from "@enclawed/plugin-sdk/plugin-entry";
import { registerEgressMediator } from "./src/mediator.js";

export default definePluginEntry({
  id: "egress-mediator",
  name: "Egress Mediator",
  description:
    "Reference monitor for covert/side-channel egress: drains the egress " +
    "stage registry and runs the defense pipeline on outbound channel text, " +
    "on the outbound arguments of egress tools, and on model input (tool " +
    "results and inbound channel messages). Also backs the LLM scrambler " +
    "with the configured model and cover traffic with the channel send path.",
  register(api) {
    registerEgressMediator(api);
  },
});
