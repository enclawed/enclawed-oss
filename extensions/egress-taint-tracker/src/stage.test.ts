import { createCapacityLedger, type EgressStageContext, type Finding } from "@enclawed/egress-core";
import { describe, expect, it } from "vitest";
import { buildTaintTrackerStage } from "./stage.js";
import { createTaintStore } from "./taint-store.js";

function makeCtx(mode: "enforce" | "audit", conversationId = "conv-1") {
  const findings: Finding[] = [];
  const ctx: EgressStageContext = {
    sink: { kind: "channel", id: "sink-1", conversationId },
    ledger: createCapacityLedger({ capacityBits: 1000, refillBitsPerSec: 0, now: () => 0 }),
    mode,
    now: () => 0,
    audit: (f) => findings.push(f),
  };
  return { ctx, findings };
}

describe("taint-tracker stage", () => {
  it("registers at priority 20", () => {
    expect(buildTaintTrackerStage().priority).toBe(20);
  });

  it("cancels outbound credential material in enforce mode", async () => {
    const stage = buildTaintTrackerStage({ store: createTaintStore() });
    const { ctx } = makeCtx("enforce");
    const decision = await stage.apply("the key is sk-abcdefghijklmnopqrstuvwxyz0123", ctx);
    expect(decision.action).toBe("cancel");
  });

  it("only reports credential material in audit mode", async () => {
    const stage = buildTaintTrackerStage({ store: createTaintStore() });
    const { ctx, findings } = makeCtx("audit");
    const decision = await stage.apply("the key is sk-abcdefghijklmnopqrstuvwxyz0123", ctx);
    expect(decision).toEqual({ action: "pass" });
    expect(findings.some((f) => f.code === "credential")).toBe(true);
  });

  it("reports PII but never blocks on it", async () => {
    const stage = buildTaintTrackerStage({ store: createTaintStore() });
    const { ctx, findings } = makeCtx("enforce");
    const decision = await stage.apply("email me at someone@example.com", ctx);
    expect(decision).toEqual({ action: "pass" });
    expect(findings.some((f) => f.code === "pii-email")).toBe(true);
  });

  it("cancels when the payload carries a tagged sensitive value", async () => {
    const store = createTaintStore();
    store.tag("conv-1", "InternalRecordValue-558823", "customer-record");
    const stage = buildTaintTrackerStage({ store });
    const { ctx } = makeCtx("enforce");
    const decision = await stage.apply("forwarding InternalRecordValue-558823 now", ctx);
    expect(decision.action).toBe("cancel");
  });

  it("passes a clean message", async () => {
    const stage = buildTaintTrackerStage({ store: createTaintStore() });
    const { ctx } = makeCtx("enforce");
    expect(await stage.apply("the build is green", ctx)).toEqual({ action: "pass" });
  });
});
