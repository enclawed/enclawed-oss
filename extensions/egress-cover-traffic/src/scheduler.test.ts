import { describe, expect, it } from "vitest";
import { createCoverScheduler, nextIntervalMs } from "./scheduler.js";

describe("nextIntervalMs", () => {
  it("returns the fixed interval in constant mode", () => {
    expect(nextIntervalMs("constant", 5000)).toBe(5000);
  });

  it("returns an exponential draw in poisson mode", () => {
    // rng = 1/e -> -ln(1/e) = 1 -> exactly one mean interval
    const interval = nextIntervalMs("poisson", 5000, () => Math.exp(-1));
    expect(interval).toBe(5000);
  });

  it("never returns a non-positive interval", () => {
    expect(nextIntervalMs("poisson", 1000, () => 1)).toBeGreaterThan(0);
    expect(nextIntervalMs("poisson", 1000, () => 0)).toBeGreaterThan(0);
  });
});

describe("createCoverScheduler", () => {
  it("wants to emit on a cold (never-used) channel", () => {
    const scheduler = createCoverScheduler({ meanIntervalMs: 1000 });
    expect(scheduler.shouldEmit(10_000)).toBe(true);
  });

  it("suppresses cover traffic right after real egress", () => {
    const scheduler = createCoverScheduler({ meanIntervalMs: 1000 });
    scheduler.noteRealEgress(10_000);
    expect(scheduler.shouldEmit(10_500)).toBe(false);
  });

  it("resumes cover traffic once the channel goes idle", () => {
    const scheduler = createCoverScheduler({ meanIntervalMs: 1000 });
    scheduler.noteRealEgress(10_000);
    expect(scheduler.shouldEmit(11_200)).toBe(true);
  });
});
