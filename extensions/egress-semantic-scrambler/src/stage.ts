import { mapSegments, STAGE_IDS, STAGE_PRIORITY, type EgressStage } from "@enclawed/egress-core";
import { scramble, type ScramblerOptions } from "./scrambler.js";

/**
 * Build the semantic-scrambler stage (priority 45). It proposes a
 * meaning-preserving rewrite that collapses linguistic covert-encoding
 * dimensions — synonym choice, contraction form, active/passive voice.
 * Default mode is audit (the rewrite is recorded, not applied) because the
 * transform is lossy at the surface; escalate to enforce to apply it.
 */
export function buildSemanticScramblerStage(options?: Partial<ScramblerOptions>): EgressStage {
  return {
    id: STAGE_IDS.scrambler,
    priority: STAGE_PRIORITY[STAGE_IDS.scrambler],
    kinds: ["channel", "tool-call", "model-input"],
    apply(content, ctx) {
      const text = mapSegments(content, ctx, (segment) => {
        const result = scramble(segment, options);
        for (const finding of result.findings) {
          ctx.audit({ stageId: STAGE_IDS.scrambler, ...finding });
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
