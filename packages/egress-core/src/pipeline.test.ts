import { describe, expect, it } from "vitest";
import { createCapacityLedger } from "./ledger.js";
import { runEgressPipeline, type PipelineBase } from "./pipeline.js";
import type { EgressMode, EgressStage, Finding } from "./types.js";

function base(): PipelineBase {
  return {
    sink: { kind: "channel", id: "sink-1" },
    ledger: createCapacityLedger({ capacityBits: 1000, refillBitsPerSec: 0, now: () => 0 }),
    now: () => 0,
  };
}

const allEnforce = (): EgressMode => "enforce";

const stage = (id: string, priority: number, apply: EgressStage["apply"]): EgressStage => ({
  id,
  priority,
  kinds: ["channel"],
  apply,
});

describe("runEgressPipeline", () => {
  it("passes content through unchanged with no stages", async () => {
    const result = await runEgressPipeline("hello", [], base(), { modeFor: allEnforce });
    expect(result).toMatchObject({ cancelled: false, content: "hello", delayMs: 0 });
  });

  it("chains rewrites in priority order", async () => {
    const stages = [
      stage("b", 20, (c) => ({ action: "rewrite", content: `${c}!` })),
      stage("a", 10, (c) => ({ action: "rewrite", content: c.toUpperCase() })),
    ];
    const result = await runEgressPipeline("hi", stages, base(), { modeFor: allEnforce });
    expect(result).toMatchObject({ cancelled: false, content: "HI!" });
  });

  it("cancel short-circuits the remaining stages", async () => {
    let reachedSecond = false;
    const stages = [
      stage("a", 10, () => ({ action: "cancel", reason: "blocked" })),
      stage("b", 20, () => {
        reachedSecond = true;
        return { action: "pass" };
      }),
    ];
    const result = await runEgressPipeline("x", stages, base(), { modeFor: allEnforce });
    expect(result.cancelled).toBe(true);
    expect(reachedSecond).toBe(false);
  });

  it("accumulates delays", async () => {
    const stages = [
      stage("a", 10, () => ({ action: "delay", delayMs: 100 })),
      stage("b", 20, () => ({ action: "delay", delayMs: 250 })),
    ];
    const result = await runEgressPipeline("x", stages, base(), { modeFor: allEnforce });
    expect(result).toMatchObject({ cancelled: false, delayMs: 350 });
  });

  it("audit mode suppresses rewrite and cancel but records findings", async () => {
    const stages = [stage("a", 10, () => ({ action: "cancel", reason: "would-block" }))];
    const result = await runEgressPipeline("keep-me", stages, base(), {
      modeFor: () => "audit",
    });
    expect(result).toMatchObject({ cancelled: false, content: "keep-me" });
    expect(result.findings.some((f) => f.code === "cancel-suppressed-audit")).toBe(true);
  });

  it("fails closed (cancels) when an enforcing stage throws", async () => {
    const stages = [
      stage("a", 10, () => {
        throw new Error("boom");
      }),
    ];
    const result = await runEgressPipeline("x", stages, base(), { modeFor: allEnforce });
    expect(result.cancelled).toBe(true);
  });

  it("fails open (continues) when an auditing stage throws", async () => {
    const stages = [
      stage("a", 10, () => {
        throw new Error("boom");
      }),
      stage("b", 20, (c) => ({ action: "rewrite", content: `${c}-ok` })),
    ];
    const result = await runEgressPipeline("x", stages, base(), {
      modeFor: (id) => (id === "a" ? "audit" : "enforce"),
    });
    expect(result).toMatchObject({ cancelled: false, content: "x-ok" });
  });

  it("skips stages whose mode is off", async () => {
    const stages = [stage("a", 10, () => ({ action: "cancel", reason: "off-stage" }))];
    const result = await runEgressPipeline("x", stages, base(), { modeFor: () => "off" });
    expect(result.cancelled).toBe(false);
  });

  it("forwards findings to the external audit sink", async () => {
    const seen: Finding[] = [];
    const stages = [
      stage("a", 10, (_c, ctx) => {
        ctx.audit({ stageId: "a", severity: "low", code: "noted", message: "hi" });
        return { action: "pass" };
      }),
    ];
    await runEgressPipeline("x", stages, base(), {
      modeFor: allEnforce,
      audit: (f) => seen.push(f),
    });
    expect(seen.map((f) => f.code)).toContain("noted");
  });
});
