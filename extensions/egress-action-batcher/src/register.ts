// Builds the action batcher from plugin config and registers it with the
// shared egress-core slot; the egress-mediator applies it at the tool-call
// chokepoint. Defaults are the safe posture: canonical order and idempotent
// repeat collapse on, padding off.

import {
  createActionBatcher,
  registerActionBatcher,
  resolveActionBatcherOptions,
  type ActionBatcher,
} from "@enclawed/egress-core";

export function registerConfiguredActionBatcher(pluginConfig: unknown): ActionBatcher | null {
  const raw = (pluginConfig && typeof pluginConfig === "object" ? pluginConfig : {}) as {
    enabled?: unknown;
  };
  if (raw.enabled === false) {
    return null;
  }
  const batcher = createActionBatcher(resolveActionBatcherOptions(pluginConfig));
  registerActionBatcher(batcher);
  return batcher;
}
