import { describe, expect, it } from "vitest";
import type { EnclawedConfig } from "../config/config.js";
import { resolveHumanDelayConfig } from "./identity.js";

describe("resolveHumanDelayConfig", () => {
  it("returns undefined when no humanDelay config is set", () => {
    const cfg: EnclawedConfig = {};
    expect(resolveHumanDelayConfig(cfg, "main")).toBeUndefined();
  });

  it("merges defaults with per-agent overrides", () => {
    const cfg: EnclawedConfig = {
      agents: {
        defaults: {
          humanDelay: { mode: "natural", minMs: 800, maxMs: 1800 },
        },
        list: [{ id: "main", humanDelay: { mode: "custom", minMs: 400 } }],
      },
    };

    expect(resolveHumanDelayConfig(cfg, "main")).toEqual({
      mode: "custom",
      minMs: 400,
      maxMs: 1800,
    });
  });
});
