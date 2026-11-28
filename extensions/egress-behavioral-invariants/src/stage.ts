import { STAGE_IDS, STAGE_PRIORITY, type EgressStage } from "@enclawed/egress-core";
import {
  createBehavioralMonitor,
  type BehavioralMonitor,
  type BehavioralOptions,
} from "./invariants.js";

export type BehavioralStageDeps = {
  /** Override the monitor — used by tests. */
  monitor?: BehavioralMonitor;
};

/**
 * Build the behavioral-invariants stage (priority 50, last). It enforces
 * stateful rate/volume limits, quantizes send timing, and flags periodic
 * egress. Default mode is `audit`; the pipeline suppresses the cancel/delay
 * until the deployment escalates the stage to `enforce`.
 */
export function buildBehavioralInvariantsStage(
  options?: Partial<BehavioralOptions>,
  deps: BehavioralStageDeps = {},
): EgressStage {
  const monitor = deps.monitor ?? createBehavioralMonitor(options);
  return {
    id: STAGE_IDS.behavioral,
    priority: STAGE_PRIORITY[STAGE_IDS.behavioral],
    kinds: ["channel", "tool-call", "model-input"],
    apply(content, ctx) {
      const evaluation = monitor.evaluate(
        ctx.sink.id,
        ctx.now(),
        content.length,
        ctx.mode === "enforce",
      );
      for (const finding of evaluation.findings) {
        ctx.audit({ stageId: STAGE_IDS.behavioral, ...finding });
      }
      return evaluation.decision;
    },
  };
}
