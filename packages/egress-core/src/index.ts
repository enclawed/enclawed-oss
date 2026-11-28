// Barrel for the egress reference-monitor core, consumed by the bundled
// egress defense extensions as the `@enclawed/egress-core` workspace package.

export type {
  CapacityLedger,
  EgressDecision,
  EgressMode,
  EgressSink,
  EgressSinkKind,
  EgressStage,
  EgressStageContext,
  Finding,
  PipelineResult,
} from "./types.js";

export { getEgressStages, registerEgressStage, resetEgressRegistry } from "./registry.js";

export { createCapacityLedger, createLedgerStore, type LedgerOptions } from "./ledger.js";

export { monotonicNow } from "./clock.js";

export { createAuditBuffer, type AuditBuffer, type AuditRecord } from "./audit.js";

export {
  DEFAULT_STAGE_MODES,
  STAGE_IDS,
  STAGE_PRIORITY,
  defaultEgressConfig,
  mergeEgressConfig,
  resolveStageMode,
  type EgressConfig,
  type EgressStageConfig,
} from "./config.js";

export { runEgressPipeline, type PipelineBase, type PipelineOptions } from "./pipeline.js";

export { createEgressRunner, type EgressRunner, type EgressRunnerOptions } from "./runner.js";

export {
  emitOutbound,
  hasLlmCompleter,
  hasOutboundEmitter,
  llmComplete,
  resetEgressHostSeams,
  setLlmCompleter,
  setOutboundEmitter,
  type CoverTrafficMessage,
  type LlmCompleter,
} from "./host-seams.js";

export {
  getMediaScramblers,
  registerMediaScrambler,
  resetMediaRegistry,
  type AudioPayload,
  type ImagePayload,
  type MediaKind,
  type MediaScrambler,
} from "./media.js";

export { hashAudioPayload, hashImagePayload } from "./media-hash.js";

export {
  hasMediaExemptionCheck,
  isMediaExempt,
  resetMediaExemption,
  setMediaExemptionCheck,
  type MediaExemptionCheck,
  type MediaExemptionSubject,
} from "./media-exemption.js";

export { canonicalMediaOrder, type MediaBatchItem } from "./media-sequence.js";

export {
  mediateMediaBatch,
  type MediaEgressOptions,
  type MediaEgressResult,
} from "./media-egress.js";

export { createPluginConfigReader, type PluginConfigReader } from "./config-validation.js";

export { mapSegments, mapSegmentsAsync } from "./segments.js";

export {
  actionKey,
  canonicalActionEncoding,
  classifyActionIdempotency,
  currentToolReplayCall,
  getToolRequestClient,
  hasToolCapabilityClassifier,
  httpOrigin,
  isSafeHttpMethod,
  notifyToolRequestIssued,
  onToolRequestIssued,
  outboundGetUrl,
  requestToolIssueSlot,
  setToolCapabilityClassifier,
  setToolRequestClient,
  wireRequestUrl,
  type ActionIdempotency,
  type EgressAction,
  type ToolCapabilityClassifier,
  type ToolCapabilityInfo,
  type ToolIssueListener,
  type ToolReplayCall,
  type ToolReplayDirective,
  type ToolReplayOutcome,
  type ToolRequestCheck,
  type ToolRequestClient,
} from "./action.js";

export {
  ACTION_BATCHER_STAGE_ID,
  DEFAULT_ACTION_BATCHER_OPTIONS,
  DEFAULT_BATCHED_TOOLS,
  PADDING_TOOL,
  REFRESH_DEFAULTS,
  createActionBatcher,
  getActionBatcher,
  registerActionBatcher,
  resetActionBatcher,
  resolveActionBatcherOptions,
  unmappedToolReason,
  type ActionBatcher,
  type ActionBatcherDeps,
  type ActionBatcherOptions,
  type ActionRelease,
  type ActionSubmission,
  type RecordedOutcome,
  type RefreshFn,
  type RefreshTuning,
} from "./action-batcher.js";

export {
  createSeededRandomInt,
  deriveScopeSeed,
  setRefreshEntropySource,
  type RefreshEntropySource,
} from "./refresh-entropy.js";

/** Shannon entropy (bits per symbol) of a string's code-unit distribution. */
export function shannonEntropyBits(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  const counts = new Map<string, number>();
  for (const ch of text) {
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / text.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/** Rough covert-capacity estimate (bits) of a string: entropy × length. */
export function estimateCovertBits(text: string): number {
  return shannonEntropyBits(text) * text.length;
}
