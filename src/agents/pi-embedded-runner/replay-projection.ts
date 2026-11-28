import type { Agent, AgentMessage, AgentRequestUpdate } from "@mariozechner/pi-agent-core";
import type { SessionProjection } from "@mariozechner/pi-coding-agent";

/**
 * Keeps Enclawed's replay-sanitized history in every model request.
 *
 * pi-coding-agent >= 0.87 makes the SessionManager canonical: before every
 * request (`agent.prepareRequest`) and between turns it rebuilds the request
 * transcript from `sessionManager.buildSessionProjection()`, so assigning
 * `agent.state.messages` no longer changes what the model sees. Enclawed
 * prepares the replay view of the prior history once per attempt
 * (inter-session provenance markers, replay validation, tool-call/result
 * repair, heartbeat filtering, DM history limits, image limits, provider
 * replay hooks, context-engine assembly). This projection substitutes that
 * view for the prior part of pi's rebuilt transcript on every request and
 * keeps the messages added during the attempt (prompt, tool calls/results)
 * exactly as pi projects them, which is what pi < 0.87 sent.
 *
 * The prior view is fixed for the attempt, so requests stay byte-stable
 * across turns (prompt-cache prefix). The projection fails safe: when the
 * baseline cannot be reused (the prior part of the session changed during the
 * attempt through compaction, branch navigation or a context edit of a prior
 * entry, or pi's request does not line up with the session projection), the
 * prior view is re-derived from pi's current request transcript by the same
 * side-effect-free replay pipeline and cached as the new baseline. If that
 * re-derivation fails, the request is refused; unsanitized history is never
 * sent.
 */

type ProjectionSource = { buildSessionProjection(): SessionProjection };

export type PriorHistoryBaseline = {
  /** Source entry ids of the session projection when the prior view was captured. */
  entryIds: readonly string[];
  /** Conversation (non-system) messages those entries projected at capture time. */
  rawConversationCount: number;
  /** Enclawed's replay view of that prior history (conversation messages only). */
  conversation: readonly AgentMessage[];
};

export type PriorHistoryProjectionResult =
  | { kind: "projected"; messages: AgentMessage[] }
  | { kind: "prior-changed" }
  | { kind: "misaligned" };

function isConversationMessage(message: AgentMessage): boolean {
  return message.role !== "system";
}

export function countConversationMessages(messages: readonly AgentMessage[]): number {
  return messages.filter(isConversationMessage).length;
}

function countConversation(entries: SessionProjection["entries"]): number {
  let count = 0;
  for (const entry of entries) {
    count += entry.messages.filter(isConversationMessage).length;
  }
  return count;
}

export function capturePriorHistoryBaseline(params: {
  sessionManager: ProjectionSource;
  priorView: readonly AgentMessage[];
}): PriorHistoryBaseline {
  const projection = params.sessionManager.buildSessionProjection();
  return {
    entryIds: projection.entries.map((entry) => entry.sourceEntry.id),
    rawConversationCount: countConversation(projection.entries),
    conversation: params.priorView.filter(isConversationMessage),
  };
}

function priorEntriesUnchanged(
  baseline: PriorHistoryBaseline,
  projection: SessionProjection,
): boolean {
  if (projection.entries.length < baseline.entryIds.length) {
    return false;
  }
  for (let index = 0; index < baseline.entryIds.length; index++) {
    if (projection.entries[index]?.sourceEntry.id !== baseline.entryIds[index]) {
      return false;
    }
  }
  if (
    countConversation(projection.entries.slice(0, baseline.entryIds.length)) !==
    baseline.rawConversationCount
  ) {
    return false;
  }
  const priorIds = new Set(baseline.entryIds);
  return projection.entries
    .slice(baseline.entryIds.length)
    .every(
      (entry) =>
        entry.sourceEntry.type !== "context_edit" || !priorIds.has(entry.sourceEntry.targetId),
    );
}

/**
 * Replace the prior conversation in `messages` (pi's rebuilt request
 * transcript, system messages included) with the baseline view. System
 * messages (pi's prompt sections and tool declarations) are kept in order
 * ahead of the conversation; Enclawed's system-prompt projection collapses
 * them into the single request system message later.
 */
export function projectPriorHistory(params: {
  baseline: PriorHistoryBaseline;
  projection: SessionProjection;
  messages: readonly AgentMessage[];
}): PriorHistoryProjectionResult {
  const { baseline, projection, messages } = params;
  if (!priorEntriesUnchanged(baseline, projection)) {
    return { kind: "prior-changed" };
  }
  const system = messages.filter((message) => !isConversationMessage(message));
  const conversation = messages.filter(isConversationMessage);
  if (
    conversation.length !== projection.messages.filter(isConversationMessage).length ||
    conversation.length < baseline.rawConversationCount
  ) {
    return { kind: "misaligned" };
  }
  return {
    kind: "projected",
    messages: [
      ...system,
      ...baseline.conversation,
      ...conversation.slice(baseline.rawConversationCount),
    ],
  };
}

function isRequestUpdate(
  value: AgentRequestUpdate | void | undefined,
): value is AgentRequestUpdate {
  return typeof value === "object" && value !== null;
}

/**
 * Wrap `agent.prepareRequest` (outermost, after pi's canonical projection) so
 * every request starts from Enclawed's prior-history view. Runs before
 * `transformContext`, so pi extension `context` handlers, the system-prompt
 * projection and the context guards all operate on the sanitized view, as they
 * did on `agent.state.messages` before pi 0.87.
 */
export type PriorHistoryFallbackReason = "prior-changed" | "misaligned";

/** Thrown from `prepareRequest` when the replay view cannot be re-derived. */
export class PriorHistoryProjectionError extends Error {
  constructor(reason: PriorHistoryFallbackReason, cause: unknown) {
    super(
      `Refusing model request: Enclawed could not re-derive the sanitized replay history (${reason}); unsanitized session history is never sent.`,
      { cause },
    );
    this.name = "PriorHistoryProjectionError";
  }
}

export function installPriorHistoryProjection(params: {
  agent: Pick<Agent, "prepareRequest">;
  sessionManager: ProjectionSource;
  baseline: PriorHistoryBaseline;
  /**
   * Re-run Enclawed's replay pipeline (without persistent side effects) on a
   * conversation and return the replay view. Receives a deep copy.
   */
  rebuildPriorView: (conversation: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
  onFallback?: (reason: PriorHistoryFallbackReason) => void;
}): () => void {
  const { agent, sessionManager } = params;
  let baseline = params.baseline;
  const previousPrepareRequest = agent.prepareRequest;
  agent.prepareRequest = async (request, signal) => {
    const prepared = await previousPrepareRequest?.(request, signal);
    const update = isRequestUpdate(prepared) ? prepared : undefined;
    const context = update?.context ?? request.context;
    const projection = sessionManager.buildSessionProjection();
    const result = projectPriorHistory({ baseline, projection, messages: context.messages });
    if (result.kind === "projected") {
      return { ...update, context: { ...context, messages: result.messages } };
    }
    params.onFallback?.(result.kind);
    const system = context.messages.filter((message) => !isConversationMessage(message));
    const conversation = context.messages.filter(isConversationMessage);
    let rebuilt: AgentMessage[];
    try {
      rebuilt = (await params.rebuildPriorView(structuredClone(conversation), signal)).filter(
        isConversationMessage,
      );
    } catch (error) {
      throw new PriorHistoryProjectionError(result.kind, error);
    }
    // Cache the re-derived view as the new baseline when pi's request matches
    // the session projection, so later requests reuse it byte-for-byte.
    if (conversation.length === countConversation(projection.entries)) {
      baseline = {
        entryIds: projection.entries.map((entry) => entry.sourceEntry.id),
        rawConversationCount: conversation.length,
        conversation: rebuilt,
      };
    }
    return { ...update, context: { ...context, messages: [...system, ...rebuilt] } };
  };
  return () => {
    agent.prepareRequest = previousPrepareRequest;
  };
}
