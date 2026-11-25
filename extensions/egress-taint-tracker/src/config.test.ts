import { getEgressStages, resetEgressRegistry } from "@enclawed/egress-core";
import { afterEach, describe, expect, it } from "vitest";
import plugin from "../index.js";
import { resolveTaintTrackerConfig } from "./config.js";

const apiWith = (pluginConfig: unknown) => ({ pluginConfig }) as never;

afterEach(() => {
  resetEgressRegistry();
});

describe("taint-tracker config", () => {
  it("FP: defaults to enabled, and enabled: true loads", () => {
    expect(resolveTaintTrackerConfig(undefined)).toEqual({ enabled: true });
    expect(resolveTaintTrackerConfig({ enabled: true })).toEqual({ enabled: true });
    plugin.register(apiWith({}));
    expect(getEgressStages().map((s) => s.id)).toContain("egress-taint-tracker");
  });

  it("attack: enabled: false and bad values are refused, and nothing is skipped silently", () => {
    expect(() => resolveTaintTrackerConfig({ enabled: false })).toThrow(/fixed on/);
    expect(() => plugin.register(apiWith({ enabled: false }))).toThrow(/fixed on/);
    expect(getEgressStages().map((s) => s.id)).not.toContain("egress-taint-tracker");
    expect(() => resolveTaintTrackerConfig({ enabled: "false" })).toThrow(
      /enabled must be a boolean/,
    );
    expect(() => resolveTaintTrackerConfig({ threshold: 1 })).toThrow(/unknown option/);
  });
});
