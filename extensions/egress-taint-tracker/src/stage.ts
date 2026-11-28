import { STAGE_IDS, STAGE_PRIORITY, type EgressStage } from "@enclawed/egress-core";
import { scanSecrets } from "./secrets.js";
import { sharedTaintStore, TAINT_SCOPE_ALL, type TaintStore } from "./taint-store.js";

export type TaintStageDeps = {
  /** Override the taint store — used by tests. */
  store?: TaintStore;
};

/**
 * Build the taint-tracker stage (priority 20). It blocks (in enforce mode) when
 * the payload carries credential material or a value previously tagged as
 * sensitive for this conversation; generic PII is reported but never blocks.
 */
export function buildTaintTrackerStage(deps: TaintStageDeps = {}): EgressStage {
  const store = deps.store ?? sharedTaintStore();
  return {
    id: STAGE_IDS.taint,
    priority: STAGE_PRIORITY[STAGE_IDS.taint],
    kinds: ["channel", "tool-call", "model-input"],
    apply(content, ctx) {
      const matches = scanSecrets(content);
      const credentials = matches.filter((m) => m.severity === "high");
      const pii = matches.filter((m) => m.severity === "low");

      for (const p of pii) {
        ctx.audit({
          stageId: STAGE_IDS.taint,
          severity: "low",
          code: `pii-${p.kind}`,
          message: `possible ${p.kind} in outbound payload`,
        });
      }

      if (credentials.length > 0) {
        const kinds = [...new Set(credentials.map((c) => c.kind))];
        ctx.audit({
          stageId: STAGE_IDS.taint,
          severity: "high",
          code: "credential",
          message: `credential material in outbound payload: ${kinds.join(", ")}`,
          estimatedBits: credentials.reduce((n, c) => n + c.length * 6, 0),
        });
        if (ctx.mode === "enforce") {
          return {
            action: "cancel",
            reason: `credential material in outbound payload (${kinds[0]})`,
          };
        }
      }

      const scope = ctx.sink.conversationId ?? ctx.sink.id;
      const scoped = store.check(scope, content);
      const global = scope === TAINT_SCOPE_ALL ? scoped : store.check(TAINT_SCOPE_ALL, content);
      const taint = {
        tainted: scoped.tainted || global.tainted,
        overlap: Math.max(scoped.overlap, global.overlap),
        matched: [...new Set([...scoped.matched, ...global.matched])],
      };
      if (taint.tainted) {
        ctx.audit({
          stageId: STAGE_IDS.taint,
          severity: "high",
          code: "taint-match",
          message: `payload matches tagged sensitive value(s): ${taint.matched.join(", ")}`,
          detail: { overlap: taint.overlap },
        });
        if (ctx.mode === "enforce") {
          return { action: "cancel", reason: "tainted sensitive value in outbound payload" };
        }
      }

      return { action: "pass" };
    },
  };
}
