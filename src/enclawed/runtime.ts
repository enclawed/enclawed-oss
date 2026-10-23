// Process-wide enclawed runtime. Stored on a globalThis symbol so the patches
// in entry.ts, plugins/*, and logging/* can consult it without creating
// import cycles. The runtime is always set after bootstrap; getRuntime()
// returns null only during the brief window before bootstrap completes
// (e.g. inside test fixtures that have not yet called bootstrapEnclawed()).

import type { AuditLogger } from "./audit-log.js";
import type { Flavor } from "./flavor.js";
import type { ModuleDecision } from "./module-loader.js";
import type { Policy } from "./policy.js";

const RUNTIME_KEY = Symbol.for("enclawed.runtime");

export type EnclawedRuntime = Readonly<{
  flavor: Flavor;
  policy: Policy;
  audit: AuditLogger;
  restoreFetch: () => void;
  fipsRequired: boolean;
  // Module decisions pre-computed at boot from the modules root manifest scan.
  // null when preload was not run (e.g. tests). Empty Map when the dir was
  // empty. Channel/provider validation gates consult this synchronously.
  moduleDecisions: ReadonlyMap<string, ModuleDecision> | null;
}>;

type GlobalWithRuntime = typeof globalThis & {
  [RUNTIME_KEY]?: EnclawedRuntime;
};

export function getRuntime(): EnclawedRuntime | null {
  return (globalThis as GlobalWithRuntime)[RUNTIME_KEY] ?? null;
}

export function setRuntime(runtime: EnclawedRuntime): void {
  (globalThis as GlobalWithRuntime)[RUNTIME_KEY] = runtime;
}

export function clearRuntime(): void {
  delete (globalThis as GlobalWithRuntime)[RUNTIME_KEY];
}
