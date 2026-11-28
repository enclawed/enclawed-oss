// Plugin config -> noise-injector options. Every transform is an internal
// constant (settings audit #54): each `false` reopened the whitespace,
// typography or punctuation channel. The keys stay accepted with the value
// `true` only; `false`, a non-boolean or an unknown key refuses the plugin.

import { createPluginConfigReader } from "@enclawed/egress-core";
import { defaultNoiseOptions, type NoiseOptions } from "./noise.js";

const KEYS = [
  "collapseWhitespaceRuns",
  "normalizeTypography",
  "collapsePunctuationRuns",
] as const satisfies readonly (keyof NoiseOptions)[];

export function resolveNoiseOptions(raw: unknown): NoiseOptions {
  const r = createPluginConfigReader("egress-noise-injector", raw, KEYS);
  for (const key of KEYS) {
    if (!r.bool(key, true)) {
      r.fail(`${key} is fixed on; false is refused`);
    }
  }
  return { ...defaultNoiseOptions };
}
