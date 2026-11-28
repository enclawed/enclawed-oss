import { createCapacityLedger, getEgressStages, resetEgressRegistry } from "@enclawed/egress-core";
import { afterEach, describe, expect, it } from "vitest";
import entry from "../index.js";
import { resolveTimingScramblerConfig } from "./config.js";
import { buildTimingScramblerStage } from "./stage.js";

afterEach(() => {
  resetEgressRegistry();
});

describe("resolveTimingScramblerConfig", () => {
  it("defaults to enabled, 0 to 750 ms", () => {
    expect(resolveTimingScramblerConfig(undefined)).toEqual({
      enabled: true,
      options: { minDelayMs: 0, maxDelayMs: 750 },
    });
  });

  it("passes the configured range to the stage", async () => {
    const { options } = resolveTimingScramblerConfig({ minDelayMs: 2000, maxDelayMs: 2750 });
    expect(options).toEqual({ minDelayMs: 2000, maxDelayMs: 2750 });
    const decision = await buildTimingScramblerStage({ ...options, maxDelayMs: 2000 }).apply("x", {
      sink: { kind: "channel", id: "s" },
      ledger: createCapacityLedger({ capacityBits: 1, refillBitsPerSec: 0, now: () => 0 }),
      mode: "enforce",
      now: () => 0,
      audit: () => {},
    });
    expect(decision).toEqual({ action: "delay", delayMs: 2000 });
  });

  it("attack: a spread narrower than the shipped 750 ms is refused", () => {
    expect(() => resolveTimingScramblerConfig({ maxDelayMs: 0 })).toThrow(/at least 750/);
    expect(() => resolveTimingScramblerConfig({ maxDelayMs: 749 })).toThrow(/at least 750/);
    expect(() => resolveTimingScramblerConfig({ minDelayMs: 2000, maxDelayMs: 2000 })).toThrow(
      /at least 750/,
    );
    expect(() => resolveTimingScramblerConfig({ minDelayMs: 100, maxDelayMs: 750 })).toThrow(
      /at least 750/,
    );
  });

  it("FP: the default and wider spreads load", () => {
    expect(resolveTimingScramblerConfig({ maxDelayMs: 750 }).options.maxDelayMs).toBe(750);
    expect(resolveTimingScramblerConfig({ maxDelayMs: 5000 }).options.maxDelayMs).toBe(5000);
    expect(resolveTimingScramblerConfig({ minDelayMs: 250, maxDelayMs: 1000 }).options).toEqual({
      minDelayMs: 250,
      maxDelayMs: 1000,
    });
  });

  it("refuses bad values and an inverted range", () => {
    expect(() => resolveTimingScramblerConfig({ maxDelayMs: -1 })).toThrow(/maxDelayMs/);
    expect(() => resolveTimingScramblerConfig({ minDelayMs: 10.5 })).toThrow(/integer/);
    expect(() => resolveTimingScramblerConfig({ minDelayMs: 900 })).toThrow(/must not exceed/);
    expect(() => resolveTimingScramblerConfig({ jitter: 1 })).toThrow(/unknown option/);
  });

  it("does not register when enabled is false", () => {
    entry.register({ pluginConfig: { enabled: false } } as never);
    expect(getEgressStages().some((s) => s.id === "egress-timing-scrambler")).toBe(false);
    entry.register({ pluginConfig: {} } as never);
    expect(getEgressStages().some((s) => s.id === "egress-timing-scrambler")).toBe(true);
  });
});
