import { createCapacityLedger, type EgressStageContext, type Finding } from "@enclawed/egress-core";
import { describe, expect, it } from "vitest";
import { buildNoiseInjectorStage } from "./stage.js";

function ctx(): { ctx: EgressStageContext; findings: Finding[] } {
  const findings: Finding[] = [];
  return {
    findings,
    ctx: {
      sink: { kind: "channel", id: "sink-1" },
      ledger: createCapacityLedger({ capacityBits: 1000, refillBitsPerSec: 0, now: () => 0 }),
      mode: "enforce",
      now: () => 0,
      audit: (f) => findings.push(f),
    },
  };
}

describe("noise-injector stage", () => {
  it("registers at priority 40", () => {
    expect(buildNoiseInjectorStage().priority).toBe(40);
  });

  it("rewrites text that carries collapsible covert dimensions", async () => {
    const stage = buildNoiseInjectorStage();
    const { ctx: c, findings } = ctx();
    const decision = await stage.apply("spaced   out!!!", c);
    expect(decision).toEqual({ action: "rewrite", content: "spaced out!" });
    expect(findings.length).toBeGreaterThan(0);
  });

  it("passes already-canonical text", async () => {
    const stage = buildNoiseInjectorStage();
    const { ctx: c } = ctx();
    expect(await stage.apply("tidy text", c)).toEqual({ action: "pass" });
  });
});
