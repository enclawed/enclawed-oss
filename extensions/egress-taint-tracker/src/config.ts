// Plugin config for the taint tracker. `enabled` is fixed on (settings audit
// #52): `false` let known secrets leave the host. The key stays accepted with
// the value `true` only; `false`, any other value or an unknown key refuses
// the plugin (and, as a security stage, gateway start). Disabling the whole
// plugin is `plugins.entries.egress-taint-tracker.enabled`, which the
// enclaved flavor's escape-hatch gate governs.

import { createPluginConfigReader } from "@enclawed/egress-core";

export type TaintTrackerConfig = { enabled: true };

export function resolveTaintTrackerConfig(raw: unknown): TaintTrackerConfig {
  const r = createPluginConfigReader("egress-taint-tracker", raw, ["enabled"]);
  if (!r.bool("enabled", true)) {
    r.fail("enabled is fixed on; false is refused");
  }
  return { enabled: true };
}
