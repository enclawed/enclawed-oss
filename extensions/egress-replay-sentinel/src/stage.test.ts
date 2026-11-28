import { createCapacityLedger, type EgressStageContext, type Finding } from "@enclawed/egress-core";
import { describe, expect, it } from "vitest";
import { buildReplaySentinelStage } from "./stage.js";

function ctx(): { ctx: EgressStageContext; findings: Finding[]; observed: () => number } {
  const findings: Finding[] = [];
  const ledger = createCapacityLedger({ capacityBits: 10_000, refillBitsPerSec: 0, now: () => 0 });
  return {
    findings,
    observed: () => ledger.observedTotal(),
    ctx: {
      sink: { kind: "channel", id: "sink-1" },
      ledger,
      mode: "audit",
      now: () => 0,
      audit: (f) => findings.push(f),
    },
  };
}

describe("replay-sentinel stage", () => {
  it("registers at priority 35", () => {
    expect(buildReplaySentinelStage().priority).toBe(35);
  });

  it("never blocks — always passes", async () => {
    const stage = buildReplaySentinelStage();
    const c = ctx();
    expect((await stage.apply("Status: OK", c.ctx)).action).toBe("pass");
    expect((await stage.apply("Status: OK.", c.ctx)).action).toBe("pass");
  });

  it("records a replay-divergence finding and charges the ledger", async () => {
    const stage = buildReplaySentinelStage();
    const c = ctx();
    await stage.apply("Status: OK", c.ctx);
    await stage.apply("Status: OK.", c.ctx);
    expect(c.findings.some((f) => f.code === "replay-divergence")).toBe(true);
    expect(c.observed()).toBeGreaterThan(0);
  });
});
