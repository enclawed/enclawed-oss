// Plugin config for the LLM scrambler. The rephrase prompt and the per-call
// piece size are fixed and not configurable. An unknown key (including the
// retired `maxChars`, which used to let long payloads pass unscrambled)
// refuses the plugin at load.

import { createPluginConfigReader } from "@enclawed/egress-core";
import { defaultLlmScramblerOptions, type LlmScramblerOptions } from "./stage.js";

export type LlmScramblerConfig = { enabled: boolean; options: LlmScramblerOptions };

export function resolveLlmScramblerConfig(raw: unknown): LlmScramblerConfig {
  const r = createPluginConfigReader("egress-llm-scrambler", raw, ["enabled"]);
  return {
    enabled: r.bool("enabled", true),
    options: { ...defaultLlmScramblerOptions },
  };
}
