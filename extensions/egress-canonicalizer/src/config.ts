// Plugin config -> canonicalizer options. Every transform is an internal
// constant (settings audit #53): each `false` reopened one stego carrier
// (zero-width, bidi, homoglyph, exotic space, JSON key order, code-point
// sequence). The keys stay accepted with the value `true` only, so a config
// that restates the default still loads; `false`, a non-boolean or an unknown
// key refuses the plugin (and, as a security stage, gateway start).

import { createPluginConfigReader } from "@enclawed/egress-core";
import { defaultCanonicalizerOptions, type CanonicalizerOptions } from "./transforms.js";

const KEYS = [
  "unicodeNfc",
  "stripInvisible",
  "stripBidi",
  "foldMixedScript",
  "normalizeWhitespace",
  "canonicalizeJson",
] as const satisfies readonly (keyof CanonicalizerOptions)[];

export function resolveCanonicalizerOptions(raw: unknown): CanonicalizerOptions {
  const r = createPluginConfigReader("egress-canonicalizer", raw, KEYS);
  for (const key of KEYS) {
    if (!r.bool(key, true)) {
      r.fail(`${key} is fixed on; false is refused`);
    }
  }
  return { ...defaultCanonicalizerOptions };
}
