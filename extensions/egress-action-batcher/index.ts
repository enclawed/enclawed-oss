import { definePluginEntry } from "@enclawed/plugin-sdk/plugin-entry";
import { registerConfiguredActionBatcher } from "./src/register.js";

export default definePluginEntry({
  id: "egress-action-batcher",
  name: "Egress Action Batcher",
  description:
    "Shrinks choice-type covert channels (which allowed actions an agent " +
    "takes, in what order, how many times): buffers independent tool calls " +
    "per window and releases them in canonical hash order, collapses " +
    "idempotent repeats, and optionally pads every window to a constant " +
    "action set.",
  register(api) {
    registerConfiguredActionBatcher(api.pluginConfig);
  },
});
