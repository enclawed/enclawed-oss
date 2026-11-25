import { STAGE_IDS, STAGE_PRIORITY, type EgressStage } from "@enclawed/egress-core";
import { createReplaySentinel, type ReplaySentinel } from "./replay.js";

export type ReplayStageDeps = { sentinel?: ReplaySentinel };

/**
 * Build the replay-sentinel stage (priority 35). It is a pure detector: it
 * never rewrites or cancels, it records replay-divergence findings and charges
 * the estimated covert bits against the per-sink ledger so the behavioral
 * stage's budget accounts for them.
 */
export function buildReplaySentinelStage(deps: ReplayStageDeps = {}): EgressStage {
  const sentinel = deps.sentinel ?? createReplaySentinel();
  return {
    id: STAGE_IDS.replay,
    priority: STAGE_PRIORITY[STAGE_IDS.replay],
    kinds: ["channel", "tool-call", "model-input"],
    apply(content, ctx) {
      const { findings } = sentinel.inspect(ctx.sink.id, content);
      for (const finding of findings) {
        ctx.audit({ stageId: STAGE_IDS.replay, ...finding });
        ctx.ledger.observe(finding.estimatedBits);
      }
      return { action: "pass" };
    },
  };
}
