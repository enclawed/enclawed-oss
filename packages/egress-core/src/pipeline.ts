// The egress pipeline runner. Drains an ordered stage list over one outbound
// payload and merges their decisions.
//
// Merge semantics mirror `src/plugins/hooks.ts` runModifyingHook: rewrites
// chain (each stage sees the prior stage's output), `cancel` is sticky and
// short-circuits, `delay` values accumulate.
//
// CRITICAL — fail-closed without throwing. The `message_sending` hook site
// (`src/infra/outbound/deliver.ts` applyMessageSendingHook) wraps the handler
// in try/catch and *swallows* thrown errors (fail-open). So the runner must
// never rely on a throw to block: a stage that throws is caught here and
// converted to an explicit `cancel` when that stage is enforcing, or skipped
// when it is only auditing.

import type {
  CapacityLedger,
  EgressDecision,
  EgressMode,
  EgressSink,
  EgressStage,
  EgressStageContext,
  Finding,
  PipelineResult,
} from "./types.js";

export type PipelineBase = {
  sink: EgressSink;
  metadata?: Record<string, unknown>;
  ledger: CapacityLedger;
  now: () => number;
  /** See `EgressStageContext.segmentBoundary`. */
  segmentBoundary?: string;
};

export type PipelineOptions = {
  /** Resolve the effective mode for a stage id. */
  modeFor: (stageId: string) => EgressMode;
  /** Optional external audit sink (in addition to the returned findings). */
  audit?: (finding: Finding) => void;
};

export async function runEgressPipeline(
  content: string,
  stages: readonly EgressStage[],
  base: PipelineBase,
  opts: PipelineOptions,
): Promise<PipelineResult> {
  let current = content;
  let delayMs = 0;
  const findings: Finding[] = [];

  for (const stage of stages) {
    const mode = opts.modeFor(stage.id);
    if (mode === "off") {
      continue;
    }

    const collect = (finding: Finding): void => {
      findings.push(finding);
      opts.audit?.(finding);
    };
    const ctx: EgressStageContext = {
      sink: base.sink,
      metadata: base.metadata,
      ledger: base.ledger,
      mode,
      now: base.now,
      audit: collect,
      ...(base.segmentBoundary ? { segmentBoundary: base.segmentBoundary } : {}),
    };

    let decision: EgressDecision;
    try {
      decision = await stage.apply(current, ctx);
    } catch (err) {
      collect({
        stageId: stage.id,
        severity: "high",
        code: "stage-error",
        message: `stage ${stage.id} threw: ${err instanceof Error ? err.message : String(err)}`,
      });
      // Fail-closed when enforcing, fail-open when only auditing.
      if (mode === "enforce") {
        return { cancelled: true, reason: `${stage.id}: internal error`, findings, delayMs };
      }
      continue;
    }

    switch (decision.action) {
      case "pass":
        break;
      case "rewrite":
        // In audit mode a stage's rewrite is recorded but not applied.
        if (mode === "enforce") {
          current = decision.content;
        } else {
          collect({
            stageId: stage.id,
            severity: "info",
            code: "rewrite-suppressed-audit",
            message: `${stage.id} proposed a rewrite (audit mode — not applied)`,
          });
        }
        break;
      case "delay":
        if (mode === "enforce") {
          delayMs += Math.max(0, decision.delayMs);
        }
        break;
      case "cancel":
        if (mode === "enforce") {
          return { cancelled: true, reason: decision.reason, findings, delayMs };
        }
        collect({
          stageId: stage.id,
          severity: "medium",
          code: "cancel-suppressed-audit",
          message: `${stage.id} would cancel (audit mode): ${decision.reason}`,
        });
        break;
    }
  }

  return { cancelled: false, content: current, delayMs, findings };
}
