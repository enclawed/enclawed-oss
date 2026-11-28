// Egress reference-monitor configuration and the staged-enforcement defaults.
//
// Staged posture (per the approved design): lossless stages enforce from day
// one; lossy / detection / shaping stages start in audit and are escalated to
// enforce per-deployment after baselining.

import type { EgressMode } from "./types.js";

/** Canonical stage ids — also the per-stage config keys. */
export const STAGE_IDS = {
  canonicalizer: "egress-canonicalizer",
  taint: "egress-taint-tracker",
  entropy: "egress-entropy-scanner",
  replay: "egress-replay-sentinel",
  noise: "egress-noise-injector",
  scrambler: "egress-semantic-scrambler",
  scramblerLlm: "egress-llm-scrambler",
  timingScrambler: "egress-timing-scrambler",
  behavioral: "egress-behavioral-invariants",
  actionBatcher: "egress-action-batcher",
  imageScrambler: "egress-image-scrambler",
  audioScrambler: "egress-audio-scrambler",
  mediaOrder: "egress-media-order",
} as const;

/** Stage priorities — lower runs earlier. */
export const STAGE_PRIORITY = {
  [STAGE_IDS.canonicalizer]: 10,
  [STAGE_IDS.taint]: 20,
  [STAGE_IDS.entropy]: 30,
  [STAGE_IDS.replay]: 35,
  [STAGE_IDS.noise]: 40,
  [STAGE_IDS.scrambler]: 45,
  [STAGE_IDS.scramblerLlm]: 46,
  [STAGE_IDS.timingScrambler]: 48,
  [STAGE_IDS.behavioral]: 50,
} as const;

/** Default per-stage mode — encodes the staged-enforcement posture. */
export const DEFAULT_STAGE_MODES: Readonly<Record<string, EgressMode>> = {
  [STAGE_IDS.canonicalizer]: "enforce", // lossless — safe to block from day one
  [STAGE_IDS.taint]: "enforce", // blocks only known-sensitive values
  [STAGE_IDS.entropy]: "audit", // measure first, escalate after baselining
  [STAGE_IDS.replay]: "audit",
  [STAGE_IDS.noise]: "audit", // lossy — opt-in to enforce
  [STAGE_IDS.scrambler]: "audit", // lossy (meaning-preserving) — opt-in to enforce
  [STAGE_IDS.scramblerLlm]: "audit", // model-backed — opt-in, inert without a wired LLM
  [STAGE_IDS.timingScrambler]: "audit", // adds latency — opt-in to enforce
  [STAGE_IDS.behavioral]: "audit",
  // Reorders independent actions and withholds idempotent repeats only; it
  // never rewrites an action, so it enforces from day one like the other
  // lossless stages. It is not a text stage and has no pipeline priority.
  [STAGE_IDS.actionBatcher]: "enforce",
  // Media egress (outbound attachments). The scramblers change pixels and
  // samples, and canonical ordering changes the order a recipient sees, so
  // all three start in audit like the other lossy stages.
  [STAGE_IDS.imageScrambler]: "audit",
  [STAGE_IDS.audioScrambler]: "audit",
  [STAGE_IDS.mediaOrder]: "audit",
};

export type EgressStageConfig = { mode: EgressMode };

export type EgressConfig = {
  enabled: boolean;
  /** Per-sink capacity ledger sizing. */
  ledger: { capacityBits: number; refillBitsPerSec: number };
  /** Per-stage overrides; falls back to DEFAULT_STAGE_MODES. */
  stages: Record<string, EgressStageConfig>;
};

export const defaultEgressConfig: EgressConfig = {
  enabled: true,
  ledger: { capacityBits: 4096, refillBitsPerSec: 256 },
  stages: {},
};

/** Resolve the effective mode for a stage from config + defaults. */
export function resolveStageMode(config: EgressConfig, stageId: string): EgressMode {
  return config.stages[stageId]?.mode ?? DEFAULT_STAGE_MODES[stageId] ?? "audit";
}

/** Merge a partial (e.g. plugin) config over the defaults. */
export function mergeEgressConfig(partial?: Partial<EgressConfig>): EgressConfig {
  if (!partial) {
    return { ...defaultEgressConfig, stages: {} };
  }
  return {
    enabled: partial.enabled ?? defaultEgressConfig.enabled,
    ledger: { ...defaultEgressConfig.ledger, ...partial.ledger },
    stages: { ...partial.stages },
  };
}
