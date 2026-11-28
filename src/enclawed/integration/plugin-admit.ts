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
import { checkModuleBinding, getModuleBinding } from "./module-binding.js";

export type AdmissionDecision = Readonly<
  | { admit: true; flavor: "open" | "enclaved"; warnings: ReadonlyArray<string> }
  | { admit: false; flavor: "open" | "enclaved"; reason: string }
>;

export type AdmissionInput = {
  pluginId: string;
  /**
   * The candidate's root directory. When given, admission also checks that it
   * is the same directory, with the same manifests, that boot-time
   * verification vouched for under this id.
   */
  rootDir?: string;
};

export function admitPluginCandidate(input: AdmissionInput): AdmissionDecision {
  const runtime = getRuntime();
  // The stricter of the bootstrapped runtime's flavor and the process flavor:
  // bootstrap can run enclaved from an option or a custom env that the
  // process-wide lookup does not see, and admission must not fall back to the
  // open rules then.
  const flavor: "open" | "enclaved" =
    runtime?.flavor === "enclaved" || getFlavor() === "enclaved" ? "enclaved" : "open";
  const decisions = runtime?.moduleDecisions ?? null;

  // Bootstrap not run yet (test harnesses, lazy-init paths). In open flavor
  // this is permissive; in enclaved this is fail-closed because the caller
  // is asking us to vouch for a plugin we never verified.
  if (!decisions) {
    if (flavor === "enclaved") {
      return Object.freeze({
        admit: false,
        flavor,
        reason: "enclaved flavor: enclawed runtime not bootstrapped, cannot vouch for plugin",
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

  // The decision is keyed by id; bind it to what was verified. A same-id
  // plugin from another root (or with edited manifests) must not ride the
  // verified plugin's signature.
  const binding = getModuleBinding(input.pluginId);
  if (binding && input.rootDir !== undefined) {
    const check = checkModuleBinding(binding, input.rootDir);
    if (!check.ok) {
      runtime?.audit
        .append({
          type: "plugin.admit.collision",
          actor: input.pluginId,
          level: null,
          payload: {
            pluginId: input.pluginId,
            flavor,
            reason: check.reason,
            verifiedRoot: check.expected.rootReal,
            verifiedManifestSha256: check.expected.manifestSha256,
            candidateRoot: check.actual?.rootReal ?? input.rootDir,
            candidateManifestSha256: check.actual?.manifestSha256 ?? null,
          },
        })
        .catch((err: unknown) => {
          process.stderr.write(
            `enclawed: could not record plugin.admit.collision for "${input.pluginId}": ${String(err)}\n`,
          );
        });
      // Refused in both flavors: in open flavor an unsigned plugin is
      // admitted under its own name, but a same-id shadow would inherit the
      // verified plugin's decision (signer, clearance) in every later lookup
      // by id, which misrepresents what is running.
      return Object.freeze({
        admit: false,
        flavor,
        reason: `plugin "${input.pluginId}" refused: ${check.reason}`,
      });
    }
  }

  if (!decision.allowed) {
    return Object.freeze({
      admit: false,
      flavor,
      reason: `plugin "${input.pluginId}" rejected: ${decision.reason}`,
    });
  }

  // A decision made under the open rules (signatures warn-only) never admits
  // a plugin in the enclaved flavor.
  if (flavor === "enclaved" && decision.flavor !== "enclaved") {
    return Object.freeze({
      admit: false,
      flavor,
      reason:
        `plugin "${input.pluginId}" refused: its module decision was made under the ` +
        `"${decision.flavor}" flavor, not "enclaved"`,
    });
  }

  return Object.freeze({
    admit: true,
    flavor,
    warnings: Object.freeze([...decision.warnings]),
  });
}
