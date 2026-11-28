import { createCapacityLedger, type EgressStageContext, type Finding } from "@enclawed/egress-core";
import { describe, expect, it } from "vitest";
import { buildSemanticScramblerStage } from "./stage.js";

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

describe("semantic-scrambler stage", () => {
  it("registers at priority 45 for every sink kind", () => {
    const stage = buildSemanticScramblerStage();
    expect(stage.id).toBe("egress-semantic-scrambler");
    expect(stage.priority).toBe(45);
    expect(stage.kinds).toEqual(["channel", "tool-call", "model-input"]);
  });

  it("rewrites text that carries linguistic variation", async () => {
    const stage = buildSemanticScramblerStage();
    const { ctx: c, findings } = ctx();
    const decision = await stage.apply("we couldn't fix the huge issue", c);
    expect(decision).toEqual({
      action: "rewrite",
      content: "we could not repair the large problem",
    });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.stageId === "egress-semantic-scrambler")).toBe(true);
  });

  it("passes already-canonical text", async () => {
    const stage = buildSemanticScramblerStage();
    const { ctx: c } = ctx();
    expect(await stage.apply("the large problem was logged", c)).toEqual({ action: "pass" });
  });
});
