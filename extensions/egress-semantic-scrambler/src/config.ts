// Plugin config for the deterministic semantic scrambler. The transforms are
// internal constants (settings audit #55): each `false` reopened the
// contraction, synonym or voice channel. They stay accepted with the value
// `true` only. `enabled` stays: it selects this scrambler or the LLM one (a
// pipeline runs at most one). A non-boolean, `false` on a transform, or an
// unknown key refuses the plugin.

import { createPluginConfigReader } from "@enclawed/egress-core";
import { defaultScramblerOptions, type ScramblerOptions } from "./scrambler.js";

const TRANSFORMS = [
  "expandContractions",
  "canonicalizeSynonyms",
  "passiveToActive",
] as const satisfies readonly (keyof ScramblerOptions)[];

export type SemanticScramblerConfig = { enabled: boolean; options: ScramblerOptions };

export function resolveSemanticScramblerConfig(raw: unknown): SemanticScramblerConfig {
  const r = createPluginConfigReader("egress-semantic-scrambler", raw, ["enabled", ...TRANSFORMS]);
  for (const key of TRANSFORMS) {
    if (!r.bool(key, true)) {
      r.fail(`${key} is fixed on; false is refused`);
    }
  }
  return { enabled: r.bool("enabled", true), options: { ...defaultScramblerOptions } };
}
