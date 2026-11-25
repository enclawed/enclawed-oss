import { createCapacityLedger, type EgressStageContext, type Finding } from "@enclawed/egress-core";
import { describe, expect, it } from "vitest";
import { createBehavioralMonitor } from "./invariants.js";
import { buildBehavioralInvariantsStage } from "./stage.js";

function makeCtx(
  mode: "enforce" | "audit",
  now: number,
): {
  ctx: EgressStageContext;
  findings: Finding[];
} {
  const findings: Finding[] = [];
  return {
    findings,
    ctx: {
      sink: { kind: "channel", id: "sink-1" },
      ledger: createCapacityLedger({ capacityBits: 1000, refillBitsPerSec: 0, now: () => now }),
      mode,
      now: () => now,
      audit: (f) => findings.push(f),
    },
  };
}

describe("behavioral-invariants stage", () => {
  it("registers at priority 50", () => {
    expect(buildBehavioralInvariantsStage().priority).toBe(50);
  });

  it("passes ordinary traffic", async () => {
    const stage = buildBehavioralInvariantsStage();
    expect((await stage.apply("hello", makeCtx("enforce", 0).ctx)).action).toBe("pass");
  });

  it("cancels once the rate invariant is exceeded", async () => {
    const monitor = createBehavioralMonitor({ maxMessagesPerWindow: 2 });
    const stage = buildBehavioralInvariantsStage(undefined, { monitor });
    await stage.apply("m", makeCtx("enforce", 0).ctx);
    await stage.apply("m", makeCtx("enforce", 0).ctx);
    const decision = await stage.apply("m", makeCtx("enforce", 0).ctx);
    expect(decision.action).toBe("cancel");
  });

  it("delays to the timing grid when quantization is enabled", async () => {
    const monitor = createBehavioralMonitor({ timingQuantumMs: 1000 }, () => 0);
    const stage = buildBehavioralInvariantsStage(undefined, { monitor });
    const decision = await stage.apply("m", makeCtx("enforce", 1234).ctx);
    expect(decision).toEqual({ action: "delay", delayMs: 766 });
  });
});
