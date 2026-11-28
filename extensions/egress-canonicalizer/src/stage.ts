import { mapSegments, STAGE_IDS, STAGE_PRIORITY, type EgressStage } from "@enclawed/egress-core";
import { canonicalize, type CanonicalizerOptions } from "./transforms.js";

/**
 * Build the canonicalizer pipeline stage. It runs at priority 10 (first) so
 * every later stage inspects already-canonicalized text. Lossless transforms
 * mean it is safe to run in `enforce` mode from day one.
 */
export function buildCanonicalizerStage(options?: Partial<CanonicalizerOptions>): EgressStage {
  return {
    id: STAGE_IDS.canonicalizer,
    priority: STAGE_PRIORITY[STAGE_IDS.canonicalizer],
    kinds: ["channel", "tool-call", "model-input"],
    apply(content, ctx) {
      // Per segment, so a tool argument that is JSON is canonicalized on its
      // own even when the call's arguments are mediated together.
      const text = mapSegments(content, ctx, (segment) => {
        const result = canonicalize(segment, options);
        for (const finding of result.findings) {
          ctx.audit({ stageId: STAGE_IDS.canonicalizer, ...finding });
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
