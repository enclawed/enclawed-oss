// LLM-based semantic scrambler.
//
// Where the deterministic semantic scrambler collapses specific linguistic
// equivalence classes (synonym rings, contractions, voice), the LLM scrambler
// regenerates the payload outright: it asks a model, under a fixed and
// immutable instruction, to rephrase the text. Re-generation discards the
// attacker's exact word, structure, and phrasing choices wholesale, so the
// covert bit-sequence carried by any of them is destroyed.
//
// It is model-backed, non-deterministic, and has a latency/cost, so it
// defaults to audit mode. In audit mode it does not call the model at all; it
// records which payloads enforce would rephrase. In enforce mode it fails
// closed (see buildLlmScramblerStage).

import {
  hasLlmCompleter,
  llmComplete,
  mapSegmentsAsync,
  STAGE_IDS,
  STAGE_PRIORITY,
  type EgressStage,
} from "@enclawed/egress-core";
import { FIXED_REPHRASE_PROMPT } from "./prompt.js";

export type LlmScramblerOptions = {
  /**
   * Longest piece sent to the model in one call. Longer text is split at
   * whitespace into pieces of at most this length, and every piece is
   * rephrased: length never exempts a payload. An internal constant; tests
   * may lower it, the plugin config cannot set it.
   */
  chunkChars: number;
};

export const LLM_SCRAMBLER_CHUNK_CHARS = 8000;

export const defaultLlmScramblerOptions: LlmScramblerOptions = {
  chunkChars: LLM_SCRAMBLER_CHUNK_CHARS,
};

/**
 * Split `text` into pieces of at most `size` characters, preferring the last
 * whitespace inside each window so words stay whole. Joining the pieces gives
 * back `text` exactly.
 */
export function chunkForRephrase(text: string, size: number): string[] {
  if (text.length <= size) {
    return [text];
  }
  const pieces: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const window = text.slice(start, end);
      const cut = Math.max(window.lastIndexOf(" "), window.lastIndexOf("\n"));
      if (cut > 0) {
        end = start + cut + 1;
      }
    }
    pieces.push(text.slice(start, end));
    start = end;
  }
  return pieces;
}

/**
 * Build the LLM-scrambler stage (priority 46). It rephrases outbound text
 * through the host-injected model completer under the fixed, non-configurable
 * rephrase prompt.
 *
 * In enforce mode it fails closed: a payload longer than one model call is
 * split and every piece is rephrased (length never exempts a payload), and a
 * missing completer or a model error cancels the payload instead of passing
 * it unscrambled. Audit mode never calls the model and never blocks.
 */
export function buildLlmScramblerStage(options?: Partial<LlmScramblerOptions>): EgressStage {
  const opts = { ...defaultLlmScramblerOptions, ...options };
  if (!Number.isInteger(opts.chunkChars) || opts.chunkChars < 1) {
    throw new Error("egress-llm-scrambler: chunkChars must be a positive integer");
  }
  return {
    id: STAGE_IDS.scramblerLlm,
    priority: STAGE_PRIORITY[STAGE_IDS.scramblerLlm],
    kinds: ["channel", "tool-call", "model-input"],
    async apply(content, ctx) {
      if (content.length === 0) {
        return { action: "pass" };
      }
      const enforcing = ctx.mode === "enforce";

      // Audit mode never calls the model: a rephrase costs a model turn and
      // its output would be discarded anyway. Record that enforce would send
      // this payload to the rephraser (or block it, with no completer), and
      // pass it unchanged.
      if (!enforcing) {
        ctx.audit({
          stageId: STAGE_IDS.scramblerLlm,
          severity: "info",
          code: "llm-rephrase-audit",
          message: hasLlmCompleter()
            ? `would re-generate ${content.length} characters through the fixed-prompt ` +
              "LLM rephraser (audit mode: model not called)"
            : `would block ${content.length} characters: no LLM completer is wired ` +
              "(audit mode)",
          estimatedBits: content.length,
        });
        return { action: "pass" };
      }

      if (!hasLlmCompleter()) {
        ctx.audit({
          stageId: STAGE_IDS.scramblerLlm,
          severity: "high",
          code: "llm-unavailable",
          message: "enforce mode with no LLM completer wired; payload blocked",
        });
        return { action: "cancel", reason: "egress-llm-scrambler: no LLM completer (enforce)" };
      }

      // One rephrase per segment (a tool call's arguments are rephrased one by
      // one so the argument structure survives), and one model call per piece
      // of a long segment.
      // Mutated inside the per-segment callback.
      const state: { failure: string | null; changed: boolean } = { failure: null, changed: false };
      const rephrased = await mapSegmentsAsync(content, ctx, async (segment) => {
        if (state.failure !== null || segment.trim().length === 0) {
          return segment;
        }
        const out: string[] = [];
        for (const piece of chunkForRephrase(segment, opts.chunkChars)) {
          if (piece.trim().length === 0) {
            out.push(piece);
            continue;
          }
          let reply: string | null;
          try {
            // The system prompt is the fixed, compiled-in constant, never config.
            reply = await llmComplete(FIXED_REPHRASE_PROMPT, piece);
          } catch (err) {
            state.failure = err instanceof Error ? err.message : String(err);
            return segment;
          }
          if (reply === null || reply.trim().length === 0) {
            state.failure = "empty model reply";
            return segment;
          }
          if (reply !== piece) {
            state.changed = true;
          }
          out.push(reply);
        }
        return out.join(out.length > 1 ? " " : "");
      });

      if (state.failure !== null) {
        ctx.audit({
          stageId: STAGE_IDS.scramblerLlm,
          severity: "high",
          code: "llm-error",
          message: `LLM rephrase failed (${state.failure}); payload blocked (enforce)`,
        });
        return {
          action: "cancel",
          reason: `egress-llm-scrambler: rephrase failed (${state.failure})`,
        };
      }
      if (!state.changed) {
        return { action: "pass" };
      }

      ctx.audit({
        stageId: STAGE_IDS.scramblerLlm,
        severity: "medium",
        code: "llm-rephrase",
        message:
          "payload re-generated by the fixed-prompt LLM rephraser — " +
          "all linguistic covert encodings collapsed",
        estimatedBits: content.length,
      });
      return { action: "rewrite", content: rephrased };
    },
  };
}
