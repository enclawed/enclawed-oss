import { STAGE_IDS, STAGE_PRIORITY, type EgressStage } from "@enclawed/egress-core";
import { randomDelayMs, type TimingScramblerOptions } from "./timing.js";

export type TimingScramblerDeps = {
  /** Override the RNG — used by tests for deterministic delays. */
  rng?: () => number;
};

/**
 * Build the timing-scrambler stage (priority 48). It returns a `delay`
 * decision with a uniformly random duration, perturbing every send time so
 * the inter-message interval carries no attacker-chosen signal. The pipeline
 * applies the delay in enforce mode and records it in audit mode.
 */
export function buildTimingScramblerStage(
  options?: Partial<TimingScramblerOptions>,
  deps: TimingScramblerDeps = {},
): EgressStage {
  return {
    id: STAGE_IDS.timingScrambler,
    priority: STAGE_PRIORITY[STAGE_IDS.timingScrambler],
    kinds: ["channel", "tool-call", "model-input"],
    apply(_content, ctx) {
      const delayMs = randomDelayMs(options, deps.rng);
      if (delayMs <= 0) {
        return { action: "pass" };
      }
      ctx.audit({
        stageId: STAGE_IDS.timingScrambler,
        severity: "info",
        code: "timing-scramble",
        message: `injected ${delayMs}ms random egress delay`,
      });
      return { action: "delay", delayMs };
    },
  };
}
