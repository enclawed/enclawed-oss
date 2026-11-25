import {
  createCapacityLedger,
  getEgressStages,
  resetEgressHostSeams,
  resetEgressRegistry,
  setLlmCompleter,
} from "@enclawed/egress-core";
import { afterEach, describe, expect, it } from "vitest";
import entry from "../index.js";
import { resolveLlmScramblerConfig } from "./config.js";

afterEach(() => {
  resetEgressRegistry();
  resetEgressHostSeams();
});

describe("resolveLlmScramblerConfig", () => {
  it("FP: defaults to enabled with the fixed piece size", () => {
    expect(resolveLlmScramblerConfig(undefined)).toEqual({
      enabled: true,
      options: { chunkChars: 8000 },
    });
    expect(resolveLlmScramblerConfig({ enabled: false }).enabled).toBe(false);
  });

  it("attack: the retired maxChars bypass knob and unknown keys are refused", () => {
    expect(() => resolveLlmScramblerConfig({ maxChars: 1 })).toThrow(/unknown option/);
    expect(() => resolveLlmScramblerConfig({ maxChars: 1_000_000 })).toThrow(/unknown option/);
    expect(() => resolveLlmScramblerConfig({ chunkChars: 1 })).toThrow(/unknown option/);
    expect(() => resolveLlmScramblerConfig({ prompt: "x" })).toThrow(/unknown option/);
    expect(() => entry.register({ pluginConfig: { maxChars: 5 } } as never)).toThrow(
      /unknown option/,
    );
  });

  it("attack: the registered stage rephrases a long payload in enforce", async () => {
    let calls = 0;
    setLlmCompleter(async (_s, u) => {
      calls++;
      return `r ${u}`;
    });
    entry.register({ pluginConfig: {} } as never);
    const stage = getEgressStages().find((s) => s.id === "egress-llm-scrambler")!;
    const decision = await stage.apply("x ".repeat(9000), {
      sink: { kind: "channel", id: "s" },
      ledger: createCapacityLedger({ capacityBits: 1, refillBitsPerSec: 0, now: () => 0 }),
      mode: "enforce",
      now: () => 0,
      audit: () => {},
    });
    expect(decision.action).toBe("rewrite");
    expect(calls).toBeGreaterThan(1);
  });
});
