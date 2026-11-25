// Shared types for the covert/side-channel egress reference monitor.
//
// The reference monitor mediates a single egress chokepoint and runs an
// ordered pipeline of stages. Each stage inspects (and may rewrite, delay, or
// cancel) the outbound text. The design goal is channel-capacity reduction:
// no stage claims to prove zero leakage; together they drive the achievable
// covert bit-rate toward zero and record a measured residual estimate.

/** Egress surface a stage is mediating. */
export type EgressSinkKind = "channel" | "tool-call" | "model-input";

/** Per-stage enforcement posture. `off` skips the stage entirely. */
export type EgressMode = "enforce" | "audit" | "off";

/** Identifies the destination an outbound payload is heading to. */
export type EgressSink = {
  kind: EgressSinkKind;
  /** Stable per-destination key — used to scope the capacity ledger. */
  id: string;
  channelId?: string;
  accountId?: string;
  conversationId?: string;
  toolName?: string;
};

/** A single observation produced by a stage. */
export type Finding = {
  stageId: string;
  severity: "info" | "low" | "medium" | "high";
  /** Short machine code, e.g. "zero-width-strip" or "entropy-anomaly". */
  code: string;
  message: string;
  /** Estimated covert-channel bits this finding represents/removed. */
  estimatedBits?: number;
  detail?: Record<string, unknown>;
};

/** The outcome a stage returns for one payload. */
export type EgressDecision =
  | { action: "pass" }
  | { action: "rewrite"; content: string }
  | { action: "cancel"; reason: string }
  | { action: "delay"; delayMs: number };

/**
 * Per-sink leaky-bucket budget. The entropy scanner *measures* residual covert
 * bits; the behavioral-invariants stage *enforces* a bit-budget through this.
 */
export interface CapacityLedger {
  /** Consume `bits` if available; returns false (no consumption) if exhausted. */
  tryConsume(bits: number): boolean;
  /** Current available bits after refill. */
  available(): number;
  /** Refill the bucket up to `nowMs`. */
  refill(nowMs: number): void;
  /** Record bits seen without enforcing — used in audit mode. */
  observe(bits: number): void;
  /** Total bits observed (audit accounting). */
  observedTotal(): number;
}

/** Context handed to each stage's `apply()`. */
export type EgressStageContext = {
  sink: EgressSink;
  metadata?: Record<string, unknown>;
  ledger: CapacityLedger;
  /** Resolved mode for *this* stage. */
  mode: EgressMode;
  /** Injectable clock — deterministic in tests, real in production. */
  now: () => number;
  /** Emit a finding (audit trail). */
  audit: (finding: Finding) => void;
  /**
   * Set when the payload is several independent segments joined by this
   * marker, as for a tool call whose string arguments are mediated together
   * in one run. Rate, budget and timing stages treat the payload as one send;
   * stages that rewrite text apply their transform to each segment (see
   * `mapSegments`) and must keep every marker intact.
   */
  segmentBoundary?: string;
};

/** A pipeline stage contributed by one technique extension. */
export type EgressStage = {
  /** Unique stage id; also the config key for its mode. */
  id: string;
  /** Lower runs earlier. Canonicalizer 10, taint 20, entropy 30, replay 35,
   *  noise 40, behavioral 50. */
  priority: number;
  /** Which egress surfaces this stage applies to. */
  kinds: readonly EgressSinkKind[];
  apply: (content: string, ctx: EgressStageContext) => EgressDecision | Promise<EgressDecision>;
};

/** Result of running the full pipeline over one payload. */
export type PipelineResult =
  | { cancelled: true; reason: string; findings: Finding[]; delayMs: number }
  | { cancelled: false; content: string; delayMs: number; findings: Finding[] };
