import { describe, expect, it } from "vitest";
import { resolveCoverTrafficConfig } from "./config.js";

describe("resolveCoverTrafficConfig", () => {
  it("keeps the defaults when unset (disabled, no target)", () => {
    expect(resolveCoverTrafficConfig(undefined)).toEqual({
      enabled: false,
      mode: "poisson",
      meanIntervalMs: 60_000,
      coverContent: "[keepalive]",
    });
  });

  it("accepts a full valid config", () => {
    expect(
      resolveCoverTrafficConfig({
        enabled: true,
        mode: "constant",
        meanIntervalMs: 5_000,
        coverContent: "ping",
        target: { to: "+15550000000", channel: "signal" },
      }),
    ).toEqual({
      enabled: true,
      mode: "constant",
      meanIntervalMs: 5_000,
      coverContent: "ping",
      target: { to: "+15550000000", channel: "signal" },
    });
  });

  it("FP: the default interval and shorter ones load", () => {
    expect(resolveCoverTrafficConfig({ meanIntervalMs: 60_000 }).meanIntervalMs).toBe(60_000);
    expect(resolveCoverTrafficConfig({ meanIntervalMs: 1_000 }).meanIntervalMs).toBe(1_000);
  });

  it("refuses invalid values instead of falling back", () => {
    const refuses = (raw: unknown, pattern: RegExp) =>
      expect(() => resolveCoverTrafficConfig(raw)).toThrow(pattern);
    refuses({ enabld: true }, /unknown option\(s\): enabld/);
    refuses({ mode: "burst" }, /mode must be one of constant, poisson/);
    refuses({ meanIntervalMs: 0 }, /meanIntervalMs must be an integer >= 1000/);
    // Attack: a long mean interval means almost no cover.
    refuses({ meanIntervalMs: 86_400_000 }, /meanIntervalMs must be an integer >= 1000 <= 60000/);
    refuses({ meanIntervalMs: 60_001 }, /meanIntervalMs/);
    refuses({ coverContent: "x".repeat(4_001) }, /coverContent must be at most 4000/);
    refuses({ meanIntervalMs: "60s" }, /meanIntervalMs/);
    refuses({ coverContent: "" }, /coverContent must be a non-empty string/);
    refuses({ target: { to: "x", chan: "y" } }, /target\.chan/);
    refuses({ target: {} }, /target\.to is required/);
    refuses({ enabled: true }, /no target is configured/);
  });
});
