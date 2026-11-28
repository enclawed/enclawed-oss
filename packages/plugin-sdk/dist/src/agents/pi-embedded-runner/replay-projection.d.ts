import type { Agent, AgentMessage } from "@mariozechner/pi-agent-core";
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
type ProjectionSource = {
    buildSessionProjection(): SessionProjection;
};
export type PriorHistoryBaseline = {
    /** Source entry ids of the session projection when the prior view was captured. */
    entryIds: readonly string[];
    /** Conversation (non-system) messages those entries projected at capture time. */
    rawConversationCount: number;
    /** Enclawed's replay view of that prior history (conversation messages only). */
    conversation: readonly AgentMessage[];
};
export type PriorHistoryProjectionResult = {
    kind: "projected";
    messages: AgentMessage[];
} | {
    kind: "prior-changed";
} | {
    kind: "misaligned";
};
export declare function countConversationMessages(messages: readonly AgentMessage[]): number;
export declare function capturePriorHistoryBaseline(params: {
    sessionManager: ProjectionSource;
    priorView: readonly AgentMessage[];
}): PriorHistoryBaseline;
/**
 * Replace the prior conversation in `messages` (pi's rebuilt request
 * transcript, system messages included) with the baseline view. System
 * messages (pi's prompt sections and tool declarations) are kept in order
 * ahead of the conversation; Enclawed's system-prompt projection collapses
 * them into the single request system message later.
 */
export declare function projectPriorHistory(params: {
    baseline: PriorHistoryBaseline;
    projection: SessionProjection;
    messages: readonly AgentMessage[];
}): PriorHistoryProjectionResult;
/**
 * Wrap `agent.prepareRequest` (outermost, after pi's canonical projection) so
 * every request starts from Enclawed's prior-history view. Runs before
 * `transformContext`, so pi extension `context` handlers, the system-prompt
 * projection and the context guards all operate on the sanitized view, as they
 * did on `agent.state.messages` before pi 0.87.
 */
export type PriorHistoryFallbackReason = "prior-changed" | "misaligned";
/** Thrown from `prepareRequest` when the replay view cannot be re-derived. */
export declare class PriorHistoryProjectionError extends Error {
    constructor(reason: PriorHistoryFallbackReason, cause: unknown);
}
export declare function installPriorHistoryProjection(params: {
    agent: Pick<Agent, "prepareRequest">;
    sessionManager: ProjectionSource;
    baseline: PriorHistoryBaseline;
    /**
     * Re-run Enclawed's replay pipeline (without persistent side effects) on a
     * conversation and return the replay view. Receives a deep copy.
     */
    rebuildPriorView: (conversation: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
    onFallback?: (reason: PriorHistoryFallbackReason) => void;
}): () => void;
export {};
