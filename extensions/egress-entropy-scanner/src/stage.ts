import { STAGE_IDS, STAGE_PRIORITY, type EgressStage } from "@enclawed/egress-core";
import { scanEntropy, type EntropyOptions } from "./entropy.js";

/**
 * Build the entropy-scanner stage (priority 30). It measures the covert
 * capacity of the payload and charges it against the per-sink ledger:
 *  - audit mode   : record the estimate (`ledger.observe`) and emit findings.
 *  - enforce mode : try to consume the estimate from the ledger; if the budget
 *                   is exhausted, cancel the egress.
 */
export function buildEntropyScannerStage(options?: Partial<EntropyOptions>): EgressStage {
  return {
    id: STAGE_IDS.entropy,
    priority: STAGE_PRIORITY[STAGE_IDS.entropy],
    kinds: ["channel", "tool-call", "model-input"],
    apply(content, ctx) {
      const report = scanEntropy(content, options);
      for (const finding of report.findings) {
        ctx.audit({ stageId: STAGE_IDS.entropy, ...finding });
      }
      if (report.estimatedCovertBits <= 0) {
        return { action: "pass" };
      }

      if (ctx.mode === "enforce") {
        if (!ctx.ledger.tryConsume(report.estimatedCovertBits)) {
          return {
            action: "cancel",
            reason: `covert-capacity budget exhausted (${report.estimatedCovertBits} bits estimated)`,
          };
        }
        return { action: "pass" };
      }

      ctx.ledger.observe(report.estimatedCovertBits);
      return { action: "pass" };
    },
  };
}
