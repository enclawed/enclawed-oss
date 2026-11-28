// Standalone pipeline runner for applications that own their own
// chokepoints (for example a Claude Code PostToolUse hook rewriting
// `updatedToolOutput`, or a tool wrapper inspecting outbound arguments).
//
// It is the same pipeline the egress mediator runs inside the gateway: the
// given stages (or, by default, every stage registered for the sink kind) in
// priority order, the staged per-stage posture, a per-sink capacity ledger,
// and a bounded audit trail. Delays are reported, never slept: the caller
// decides whether a delay applies to its chokepoint.

import { createAuditBuffer, type AuditBuffer } from "./audit.js";
import { monotonicNow } from "./clock.js";
import { mergeEgressConfig, resolveStageMode, type EgressConfig } from "./config.js";
import { createLedgerStore } from "./ledger.js";
import { runEgressPipeline } from "./pipeline.js";
import { getEgressStages } from "./registry.js";
import type { EgressSink, EgressStage, PipelineResult } from "./types.js";

export type EgressRunnerOptions = {
  /** Posture and ledger sizing; falls back to the staged defaults. */
  config?: Partial<EgressConfig>;
  /** Fixed stage list. When omitted the runner drains the shared registry per call. */
  stages?: readonly EgressStage[];
  /** Injectable clock. */
  now?: () => number;
};

export type EgressRunner = {
  (content: string, sink: EgressSink, metadata?: Record<string, unknown>): Promise<PipelineResult>;
  audit: AuditBuffer;
  config: EgressConfig;
};

export function createEgressRunner(options: EgressRunnerOptions = {}): EgressRunner {
  const config = mergeEgressConfig(options.config);
  const ledgers = createLedgerStore(config.ledger);
  const audit = createAuditBuffer();
  const now = options.now ?? monotonicNow;
  const fixed = options.stages
    ? [...options.stages].toSorted((a, b) => a.priority - b.priority)
    : null;

  const run = (async (content, sink, metadata) => {
    if (!config.enabled) {
      return { cancelled: false, content, delayMs: 0, findings: [] };
    }
    const stages = fixed
      ? fixed.filter((stage) => stage.kinds.includes(sink.kind))
      : getEgressStages(sink.kind);
    return runEgressPipeline(
      content,
      stages,
      { sink, metadata, ledger: ledgers.get(sink.id), now },
      {
        modeFor: (stageId) => resolveStageMode(config, stageId),
        audit: (finding) => audit.sink(sink.id, finding),
      },
    );
  }) as EgressRunner;
  run.audit = audit;
  run.config = config;
  return run;
}
