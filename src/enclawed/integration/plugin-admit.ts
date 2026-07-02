// Host-level plugin admission gate (paper §1.3, §3.3).
//
// Called from src/plugins/manifest-registry.ts during plugin discovery.
// For each candidate plugin, this gate consults the verification map that
// preloadModuleDecisions() stashed on the runtime singleton at boot time.
//
// Policy by flavor:
//   - enclaved: reject any candidate whose enclawed.module.json is missing,
//     unparseable, signed by an unauthorized signer, or signed for a
//     clearance the signer cannot attest to. The unsafe state is unreachable.
//   - open:     admit but emit a warning; the framework still observes a
//     guarded environment (audit, classification, DLP) but does not block
//     unsigned plugins so dev/community workflows continue.
//
// This is the single chokepoint the paper requires. Channel and provider
// loaders that flow through manifest-registry.ts inherit it transparently.

import { getFlavor } from "../flavor.js";
import { getRuntime } from "../runtime.js";

export type AdmissionDecision = Readonly<
  | { admit: true; flavor: "open" | "enclaved"; warnings: ReadonlyArray<string> }
  | { admit: false; flavor: "open" | "enclaved"; reason: string }
>;

export function admitPluginCandidate(input: {
  pluginId: string;
}): AdmissionDecision {
  const flavor = getFlavor();
  const runtime = getRuntime();
  const decisions = runtime?.moduleDecisions ?? null;

  // Bootstrap not run yet (test harnesses, lazy-init paths). In open flavor
  // this is permissive; in enclaved this is fail-closed because the caller
  // is asking us to vouch for a plugin we never verified.
  if (!decisions) {
    if (flavor === "enclaved") {
      return Object.freeze({
        admit: false,
        flavor,
        reason:
          "enclaved flavor: enclawed runtime not bootstrapped, cannot vouch for plugin",
      });
    }
    return Object.freeze({ admit: true, flavor, warnings: Object.freeze([]) });
  }

  const decision = decisions.get(input.pluginId);
  if (!decision) {
    if (flavor === "enclaved") {
      return Object.freeze({
        admit: false,
        flavor,
        reason: `enclaved flavor: plugin "${input.pluginId}" has no enclawed.module.json`,
      });
    }
    return Object.freeze({
      admit: true,
      flavor,
      warnings: Object.freeze([
        `plugin "${input.pluginId}" has no enclawed.module.json (open flavor: warn-only)`,
      ]),
    });
  }

  if (!decision.allowed) {
    return Object.freeze({
      admit: false,
      flavor,
      reason: `plugin "${input.pluginId}" rejected: ${decision.reason}`,
    });
  }

  return Object.freeze({
    admit: true,
    flavor,
    warnings: Object.freeze([...decision.warnings]),
  });
}
