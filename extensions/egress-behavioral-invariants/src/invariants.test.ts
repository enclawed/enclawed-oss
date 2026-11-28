import { describe, expect, it } from "vitest";
import { coefficientOfVariation, createBehavioralMonitor } from "./invariants.js";

describe("coefficientOfVariation", () => {
  it("is zero for a constant series", () => {
    expect(coefficientOfVariation([1000, 1000, 1000])).toBe(0);
  });
  it("is positive for a varied series", () => {
    expect(coefficientOfVariation([100, 900, 200, 800])).toBeGreaterThan(0);
  });
});

describe("behavioral monitor — rate / volume", () => {
  it("cancels once the message-count invariant is exceeded (enforce)", () => {
    const monitor = createBehavioralMonitor({ maxMessagesPerWindow: 3 });
    for (let i = 0; i < 3; i++) {
      expect(monitor.evaluate("sink-1", 0, 10, true).decision.action).toBe("pass");
    }
    expect(monitor.evaluate("sink-1", 0, 10, true).decision).toEqual({
      action: "cancel",
      reason: "egress rate/volume invariant exceeded",
    });
  });

  it("cancels once the byte-volume invariant is exceeded", () => {
    const monitor = createBehavioralMonitor({ maxBytesPerWindow: 100 });
    expect(monitor.evaluate("sink-1", 0, 80, true).decision.action).toBe("pass");
    expect(monitor.evaluate("sink-1", 0, 80, true).decision.action).toBe("cancel");
  });

  it("does not accumulate events beyond the rolling window", () => {
    const monitor = createBehavioralMonitor({ maxMessagesPerWindow: 2, windowMs: 1000 });
    expect(monitor.evaluate("sink-1", 0, 10, true).decision.action).toBe("pass");
    expect(monitor.evaluate("sink-1", 5000, 10, true).decision.action).toBe("pass");
    expect(monitor.evaluate("sink-1", 10_000, 10, true).decision.action).toBe("pass");
  });

  it("still reports (and records) a rate breach in audit mode", () => {
    const monitor = createBehavioralMonitor({ maxMessagesPerWindow: 1 });
    monitor.evaluate("sink-1", 0, 10, false);
    const evaluation = monitor.evaluate("sink-1", 0, 10, false);
    expect(evaluation.decision.action).toBe("cancel");
    expect(evaluation.findings.some((f) => f.code === "rate-limit")).toBe(true);
  });
});

describe("behavioral monitor — timing", () => {
  it("delays a message that violates the minimum interval", () => {
    const monitor = createBehavioralMonitor({ minIntervalMs: 1000 });
    monitor.evaluate("sink-1", 0, 10, true);
    expect(monitor.evaluate("sink-1", 200, 10, true).decision).toEqual({
      action: "delay",
      delayMs: 800,
    });
  });

  it("quantizes the send time to the configured grid", () => {
    const monitor = createBehavioralMonitor({ timingQuantumMs: 1000 }, () => 0);
    expect(monitor.evaluate("sink-1", 1234, 10, true).decision).toEqual({
      action: "delay",
      delayMs: 766,
    });
  });

  it("paces consecutive releases to a constant cadence", () => {
    const monitor = createBehavioralMonitor({ releaseCadenceMs: 1000 });
    const delayOf = (now: number): number => {
      const d = monitor.evaluate("s", now, 10, true).decision;
      return d.action === "delay" ? d.delayMs : 0;
    };
    // Three messages arriving 200ms apart are released exactly 1000ms apart,
    // so the observed inter-send interval no longer depends on arrival timing.
    expect(0 + delayOf(0)).toBe(0);
    expect(200 + delayOf(200)).toBe(1000);
    expect(400 + delayOf(400)).toBe(2000);
  });
});

describe("behavioral monitor — periodicity", () => {
  it("flags near-constant inter-message intervals as a timing channel", () => {
    const monitor = createBehavioralMonitor({ periodicityMinSamples: 5 });
    let finding = false;
    for (let t = 0; t <= 8000; t += 1000) {
      const evaluation = monitor.evaluate("sink-1", t, 10, true);
      if (evaluation.findings.some((f) => f.code === "periodic-egress")) {
        finding = true;
      }
    }
    expect(finding).toBe(true);
  });

  it("does not flag irregular intervals", () => {
    const monitor = createBehavioralMonitor({ periodicityMinSamples: 5 });
    const times = [0, 300, 1700, 1900, 4200, 4250, 9000, 9100, 15000];
    let finding = false;
    for (const t of times) {
      const evaluation = monitor.evaluate("sink-1", t, 10, true);
      if (evaluation.findings.some((f) => f.code === "periodic-egress")) {
        finding = true;
      }
    }
    expect(finding).toBe(false);
  });
});

describe("behavioral monitor — bounded sink map", () => {
  it("a flood of new sinks does not reset a busy sink's window", () => {
    const monitor = createBehavioralMonitor({ maxMessagesPerWindow: 2, maxSinks: 4 });
    expect(monitor.evaluate("victim", 0, 10, true).decision.action).toBe("pass");
    expect(monitor.evaluate("victim", 0, 10, true).decision.action).toBe("pass");
    for (let i = 0; i < 50; i++) {
      monitor.evaluate(`junk-${i}`, 0, 1, false);
    }
    expect(monitor.evaluate("victim", 0, 10, true).decision.action).toBe("cancel");
  });
});
