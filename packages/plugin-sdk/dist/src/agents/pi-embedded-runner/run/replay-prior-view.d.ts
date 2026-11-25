import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { sanitizeSessionHistory } from "../replay-history.js";
type SanitizeParams = Omit<Parameters<typeof sanitizeSessionHistory>[0], "messages">;
/**
 * Enclawed's replay pipeline for a conversation, as the attempt applies it
 * before the prompt: replay sanitization (inter-session provenance prefix,
 * image limits, allowed-tool replay validation, tool-call/result repair,
 * provider replay hooks, turn ordering), replay-turn validation, heartbeat
 * filtering, the DM history limit with pairing repair, optional context-engine
 * assembly, and old-image pruning.
 *
 * `persistSideEffects: false` keeps it read-only (no model snapshot entry, no
 * provider-hook session writes) so it can re-derive the replay view mid-attempt.
 * Deterministic for a given input, so a re-derived view is byte-stable.
 */
export declare function buildReplayPriorView(params: {
    messages: AgentMessage[];
    sanitize: SanitizeParams;
    heartbeat?: {
        ackMaxChars?: number;
        prompt?: string;
    };
    historyLimit?: number;
    repairToolUseResultPairing: boolean;
    /** Context-engine assembly of the limited view; failures keep the pipeline view. */
    assemble?: (messages: AgentMessage[]) => Promise<AgentMessage[] | undefined>;
}): Promise<AgentMessage[]>;
export {};
