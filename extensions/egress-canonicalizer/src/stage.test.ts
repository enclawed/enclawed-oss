import { createCapacityLedger, type EgressStageContext, type Finding } from "@enclawed/egress-core";
import { describe, expect, it } from "vitest";
import { buildCanonicalizerStage } from "./stage.js";

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);

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

describe("canonicalizer stage", () => {
  it("registers at priority 10 for every sink kind", () => {
    const stage = buildCanonicalizerStage();
    expect(stage.id).toBe("egress-canonicalizer");
    expect(stage.priority).toBe(10);
    expect(stage.kinds).toEqual(["channel", "tool-call", "model-input"]);
  });

  it("rewrites content that carries invisible stego", async () => {
    const stage = buildCanonicalizerStage();
    const { ctx: c, findings } = ctx();
    const decision = await stage.apply(`hello${cp(0x200b)}${cp(0xe0048)}`, c);
    expect(decision).toEqual({ action: "rewrite", content: "hello" });
    expect(findings.some((f) => f.code === "invisible-strip")).toBe(true);
    expect(findings.every((f) => f.stageId === "egress-canonicalizer")).toBe(true);
  });

  it("passes clean text unchanged", async () => {
    const stage = buildCanonicalizerStage();
    const { ctx: c } = ctx();
    expect(await stage.apply("clean message", c)).toEqual({ action: "pass" });
  });
});
