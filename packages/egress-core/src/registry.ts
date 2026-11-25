// Module-singleton stage registry.
//
// The seven technique extensions each `registerEgressStage(...)` at plugin
// load; the `egress-mediator` extension drains the registry when an egress
// hook fires. The registry is keyed on a global `Symbol.for` so it survives
// being bundled into more than one extension — every copy of this package
// resolves to the same shared registry object on `globalThis`.

import type { EgressSinkKind, EgressStage } from "./types.js";

type RegistryState = { stages: Map<string, EgressStage> };

const REGISTRY_KEY = Symbol.for("enclawed.egress-core.stage-registry");

function getState(): RegistryState {
  const globals = globalThis as unknown as Record<symbol, RegistryState | undefined>;
  let state = globals[REGISTRY_KEY];
  if (!state) {
    state = { stages: new Map() };
    globals[REGISTRY_KEY] = state;
  }
  return state;
}

/**
 * Register a pipeline stage. Returns an unregister function; re-registering an
 * id replaces the prior stage (last writer wins, idempotent on reload).
 */
export function registerEgressStage(stage: EgressStage): () => void {
  getState().stages.set(stage.id, stage);
  return () => {
    const { stages } = getState();
    if (stages.get(stage.id) === stage) {
      stages.delete(stage.id);
    }
  };
}

/**
 * All registered stages applicable to `kind` (or every stage when omitted),
 * sorted by ascending priority.
 */
export function getEgressStages(kind?: EgressSinkKind): readonly EgressStage[] {
  const all = [...getState().stages.values()];
  const scoped = kind ? all.filter((stage) => stage.kinds.includes(kind)) : all;
  return scoped.toSorted((a, b) => a.priority - b.priority);
}

/** Test-only: clear the registry. */
export function resetEgressRegistry(): void {
  getState().stages.clear();
}
