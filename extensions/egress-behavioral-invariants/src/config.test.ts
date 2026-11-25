import { createCapacityLedger, getEgressStages, resetEgressRegistry } from "@enclawed/egress-core";
import { afterEach, describe, expect, it } from "vitest";
import entry from "../index.js";
import { resolveBehavioralOptions } from "./config.js";
import { defaultBehavioralOptions } from "./invariants.js";

afterEach(() => {
  resetEgressRegistry();
});

const ctx = (now: number) => ({
  sink: { kind: "channel" as const, id: "s" },
  ledger: createCapacityLedger({ capacityBits: 1, refillBitsPerSec: 0, now: () => now }),
  mode: "enforce" as const,
  now: () => now,
  audit: () => {},
});

describe("resolveBehavioralOptions", () => {
  it("keeps the built-in values by default", () => {
    expect(resolveBehavioralOptions(undefined)).toEqual(defaultBehavioralOptions);
  });

  it("reaches paced release from plugin config", async () => {
    entry.register({ pluginConfig: { releaseCadenceMs: 2000 } } as never);
    const stage = getEgressStages().find((s) => s.id === "egress-behavioral-invariants")!;
    expect(await stage.apply("a", ctx(0))).toEqual({ action: "pass" });
    // A second send 100 ms later is held until one cadence after the first.
    expect(await stage.apply("b", ctx(100))).toEqual({ action: "delay", delayMs: 1900 });
  });

  it("reaches timing quantization from plugin config", async () => {
    entry.register({ pluginConfig: { timingQuantumMs: 1000 } } as never);
    const stage = getEgressStages().find((s) => s.id === "egress-behavioral-invariants")!;
    expect(await stage.apply("a", ctx(250))).toEqual({ action: "delay", delayMs: 750 });
  });

  it("reaches the rate limit from plugin config", async () => {
    entry.register({ pluginConfig: { maxMessagesPerWindow: 1 } } as never);
    const stage = getEgressStages().find((s) => s.id === "egress-behavioral-invariants")!;
    expect((await stage.apply("a", ctx(0))).action).toBe("pass");
    expect((await stage.apply("b", ctx(1))).action).toBe("cancel");
  });

  it("refuses bad values, ignored jitter and unknown keys", () => {
    expect(() => resolveBehavioralOptions({ windowMs: 0 })).toThrow(/windowMs/);
    // Tighten-only: no shorter window, no higher count or byte limit.
    expect(() => resolveBehavioralOptions({ windowMs: 59_999 })).toThrow(/windowMs/);
    expect(() => resolveBehavioralOptions({ maxMessagesPerWindow: 61 })).toThrow(
      /maxMessagesPerWindow/,
    );
    expect(() => resolveBehavioralOptions({ maxBytesPerWindow: 1e12 })).toThrow(
      /maxBytesPerWindow/,
    );
    expect(resolveBehavioralOptions({ maxMessagesPerWindow: 10, windowMs: 120_000 })).toMatchObject(
      { maxMessagesPerWindow: 10, windowMs: 120_000 },
    );
    expect(() => resolveBehavioralOptions({ maxMessagesPerWindow: 0.5 })).toThrow(/integer/);
    expect(() => resolveBehavioralOptions({ releaseCadenceMs: -5 })).toThrow(/releaseCadenceMs/);
    expect(() => resolveBehavioralOptions({ jitterMs: 250 })).toThrow(/timingQuantumMs/);
    expect(resolveBehavioralOptions({ jitterMs: 250, timingQuantumMs: 1000 }).jitterMs).toBe(250);
    expect(() => resolveBehavioralOptions({ maxSinks: 1 })).toThrow(/unknown option/);
  });
});
