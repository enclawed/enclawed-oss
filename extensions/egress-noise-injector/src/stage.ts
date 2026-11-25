import { mapSegments, STAGE_IDS, STAGE_PRIORITY, type EgressStage } from "@enclawed/egress-core";
import { injectNoise, type NoiseOptions } from "./noise.js";

/**
 * Build the noise-injector stage (priority 40). It proposes a meaning-preserving
 * rewrite that collapses visible covert-encoding dimensions. Default mode is
 * `audit` (the rewrite is recorded, not applied) because the transform is
 * mildly lossy; escalate to `enforce` to apply it.
 */
export function buildNoiseInjectorStage(options?: Partial<NoiseOptions>): EgressStage {
  return {
    id: STAGE_IDS.noise,
    priority: STAGE_PRIORITY[STAGE_IDS.noise],
    kinds: ["channel", "tool-call", "model-input"],
    apply(content, ctx) {
      const text = mapSegments(content, ctx, (segment) => {
        const result = injectNoise(segment, options);
        for (const finding of result.findings) {
          ctx.audit({ stageId: STAGE_IDS.noise, ...finding });
        }
        return result.text;
      });
      if (text !== content) {
        return { action: "rewrite", content: text };
      }
      return { action: "pass" };
    },
  };
}
