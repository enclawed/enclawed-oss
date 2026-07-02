import type { CompactEmbeddedPiSessionParams } from "../pi-embedded-runner/compact.types.js";
import type {
  EmbeddedRunAttemptParams,
  EmbeddedRunAttemptResult,
} from "../pi-embedded-runner/run/types.js";
import type { EmbeddedAgentRuntime } from "../pi-embedded-runner/runtime.js";
import type { EmbeddedPiCompactResult } from "../pi-embedded-runner/types.js";

export type AgentHarnessSupportContext = {
  provider: string;
  modelId?: string;
  requestedRuntime: EmbeddedAgentRuntime;
};

export type AgentHarnessSupport =
  | { supported: true; priority?: number; reason?: string }
  | { supported: false; reason?: string };

export type AgentHarnessAttemptParams = EmbeddedRunAttemptParams;
export type AgentHarnessAttemptResult = EmbeddedRunAttemptResult;
export type AgentHarnessCompactParams = CompactEmbeddedPiSessionParams;
export type AgentHarnessCompactResult = EmbeddedPiCompactResult;
export type AgentHarnessResetParams = {
  sessionId?: string;
  sessionKey?: string;
  sessionFile?: string;
  reason?: "new" | "reset" | "idle" | "daily" | "compaction" | "deleted" | "unknown";
};

/**
 * Optional per-harness delivery defaults consumed by the auto-reply layer when
 * a harness wants to opt in to harness-owned visible-reply semantics rather
 * than relying on the generic embedded runner heuristics.
 */
export type AgentHarnessDeliveryDefaults = {
  /**
   * When set, governs which assistant outputs count as visible replies for
   * source-channel delivery. `"message_tool"` indicates the harness emits
   * structured replies through a `message` tool surface.
   */
  sourceVisibleReplies?: "message_tool";
};

export type AgentHarness = {
  id: string;
  label: string;
  pluginId?: string;
  /**
   * Optional delivery defaults that the auto-reply layer should apply when
   * this harness is selected.
   */
  deliveryDefaults?: AgentHarnessDeliveryDefaults;
  supports(ctx: AgentHarnessSupportContext): AgentHarnessSupport;
  runAttempt(params: AgentHarnessAttemptParams): Promise<AgentHarnessAttemptResult>;
  compact?(params: AgentHarnessCompactParams): Promise<AgentHarnessCompactResult | undefined>;
  reset?(params: AgentHarnessResetParams): Promise<void> | void;
  dispose?(): Promise<void> | void;
};

export type RegisteredAgentHarness = {
  harness: AgentHarness;
  ownerPluginId?: string;
};
