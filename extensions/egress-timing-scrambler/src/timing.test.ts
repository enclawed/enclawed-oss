import { createCapacityLedger, type EgressStageContext, type Finding } from "@enclawed/egress-core";
import { describe, expect, it } from "vitest";
import { buildTimingScramblerStage } from "./stage.js";
import { randomDelayMs } from "./timing.js";

describe("randomDelayMs", () => {
  it("draws within [minDelayMs, maxDelayMs]", () => {
    for (let i = 0; i < 500; i++) {
      const d = randomDelayMs({ minDelayMs: 100, maxDelayMs: 400 });
      expect(d).toBeGreaterThanOrEqual(100);
      expect(d).toBeLessThanOrEqual(400);
    }
  });

  it("returns the fixed value when min equals max", () => {
    expect(randomDelayMs({ minDelayMs: 250, maxDelayMs: 250 })).toBe(250);
  });

  it("is deterministic under an injected RNG", () => {
    expect(randomDelayMs({ minDelayMs: 0, maxDelayMs: 1000 }, () => 0)).toBe(0);
    expect(randomDelayMs({ minDelayMs: 0, maxDelayMs: 1000 }, () => 0.5)).toBe(500);
    expect(randomDelayMs({ minDelayMs: 0, maxDelayMs: 1000 }, () => 0.999999)).toBe(1000);
  });

  it("spreads draws across the range (not a constant)", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      seen.add(randomDelayMs({ minDelayMs: 0, maxDelayMs: 5000 }));
    }
    expect(seen.size).toBeGreaterThan(20);
  });
});

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

describe("timing-scrambler stage", () => {
  it("registers at priority 48", () => {
    const stage = buildTimingScramblerStage();
    expect(stage.id).toBe("egress-timing-scrambler");
    expect(stage.priority).toBe(48);
  });

  it("returns a random delay decision and records it", async () => {
    const stage = buildTimingScramblerStage(
      { minDelayMs: 0, maxDelayMs: 1000 },
      { rng: () => 0.5 },
    );
    const { ctx: c, findings } = ctx();
    const decision = await stage.apply("any payload", c);
    expect(decision).toEqual({ action: "delay", delayMs: 500 });
    expect(findings.some((f) => f.code === "timing-scramble")).toBe(true);
  });

  it("passes when the configured delay is zero", async () => {
    const stage = buildTimingScramblerStage({ minDelayMs: 0, maxDelayMs: 0 });
    expect(await stage.apply("payload", ctx().ctx)).toEqual({ action: "pass" });
  });
});
