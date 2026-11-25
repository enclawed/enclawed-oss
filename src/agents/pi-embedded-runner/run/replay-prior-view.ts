import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { filterHeartbeatPairs } from "../../../auto-reply/heartbeat-filter.js";
import { sanitizeToolUseResultPairing } from "../../session-transcript-repair.js";
import { limitHistoryTurns } from "../history.js";
import { sanitizeSessionHistory, validateReplayTurns } from "../replay-history.js";
import { pruneProcessedHistoryImages } from "./history-image-prune.js";

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
export async function buildReplayPriorView(params: {
  messages: AgentMessage[];
  sanitize: SanitizeParams;
  heartbeat?: { ackMaxChars?: number; prompt?: string };
  historyLimit?: number;
  repairToolUseResultPairing: boolean;
  /** Context-engine assembly of the limited view; failures keep the pipeline view. */
  assemble?: (messages: AgentMessage[]) => Promise<AgentMessage[] | undefined>;
}): Promise<AgentMessage[]> {
  const sanitized = await sanitizeSessionHistory({ ...params.sanitize, messages: params.messages });
  const validated = await validateReplayTurns({
    messages: sanitized,
    modelApi: params.sanitize.modelApi,
    modelId: params.sanitize.modelId,
    provider: params.sanitize.provider,
    config: params.sanitize.config,
    workspaceDir: params.sanitize.workspaceDir,
    env: params.sanitize.env,
    model: params.sanitize.model,
    sessionId: params.sanitize.sessionId,
    policy: params.sanitize.policy,
  });
  const heartbeatFiltered = filterHeartbeatPairs(
    validated,
    params.heartbeat?.ackMaxChars,
    params.heartbeat?.prompt,
  );
  const truncated = limitHistoryTurns(heartbeatFiltered, params.historyLimit);
  const limited = params.repairToolUseResultPairing
    ? sanitizeToolUseResultPairing(truncated, { erroredAssistantResultPolicy: "drop" })
    : truncated;
  let view = limited;
  if (params.assemble) {
    try {
      view = (await params.assemble(limited)) ?? limited;
    } catch {
      view = limited;
    }
  }
  // pruneProcessedHistoryImages mutates in place; work on a private copy.
  const pruned = structuredClone(view);
  pruneProcessedHistoryImages(pruned);
  return filterHeartbeatPairs(pruned, params.heartbeat?.ackMaxChars, params.heartbeat?.prompt);
}
