import { createCapacityLedger, type Finding } from "@enclawed/egress-core";
import { describe, expect, it } from "vitest";
import { resolveReplaySentinelConfig } from "./config.js";
import { createReplaySentinel } from "./replay.js";
import { buildReplaySentinelStage } from "./stage.js";

const ctx = (findings: Finding[]) => ({
  sink: { kind: "channel" as const, id: "s" },
  ledger: createCapacityLedger({ capacityBits: 1e6, refillBitsPerSec: 0, now: () => 0 }),
  mode: "audit" as const,
  now: () => 0,
  audit: (f: Finding) => findings.push(f),
});

describe("resolveReplaySentinelConfig", () => {
  it("defaults to 16 messages per sink and refuses bad values", () => {
    expect(resolveReplaySentinelConfig(undefined)).toEqual({ historyPerSink: 16 });
    // FP: the default and longer histories load.
    expect(resolveReplaySentinelConfig({ historyPerSink: 32 })).toEqual({ historyPerSink: 32 });
    expect(resolveReplaySentinelConfig({ historyPerSink: 16 })).toEqual({ historyPerSink: 16 });
    // Attack: a shorter history misses non-consecutive replays.
    expect(() => resolveReplaySentinelConfig({ historyPerSink: 1 })).toThrow(/historyPerSink/);
    expect(() => resolveReplaySentinelConfig({ historyPerSink: 15 })).toThrow(/historyPerSink/);
    expect(() => resolveReplaySentinelConfig({ historyPerSink: 0 })).toThrow(/historyPerSink/);
    expect(() => resolveReplaySentinelConfig({ historyPerSink: 1.5 })).toThrow(/integer/);
    expect(() => resolveReplaySentinelConfig({ history: 3 })).toThrow(/unknown option/);
  });

  it("bounds the history the stage compares against", async () => {
    const base = "The quarterly report is ready for review.";
    const run = async (historyPerSink: number): Promise<number> => {
      const findings: Finding[] = [];
      const stage = buildReplaySentinelStage({
        sentinel: createReplaySentinel({ historyPerSink }),
      });
      await stage.apply(base, ctx(findings));
      for (let i = 0; i < 3; i++) {
        await stage.apply(`unrelated message number ${i} about lunch plans`, ctx(findings));
      }
      await stage.apply(`${base}  `, ctx(findings));
      return findings.length;
    };
    expect(await run(16)).toBeGreaterThan(0);
    expect(await run(1)).toBe(0);
  });
});
