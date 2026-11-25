import { getEgressStages, resetEgressRegistry } from "@enclawed/egress-core";
import { beforeEach, describe, expect, it } from "vitest";
import entry from "../index.js";

const STAGE_ID = "egress-llm-scrambler";
const registered = (): boolean => getEgressStages().some((s) => s.id === STAGE_ID);

describe("egress-llm-scrambler registration (independently selectable)", () => {
  beforeEach(() => resetEgressRegistry());

  it("registers its stage by default", () => {
    entry.register({ pluginConfig: {} } as never);
    expect(registered()).toBe(true);
  });

  it("does NOT register when its own config.enabled is false", () => {
    entry.register({ pluginConfig: { enabled: false } } as never);
    expect(registered()).toBe(false);
  });

  it("is selectable independently of the deterministic scrambler", () => {
    // Disabling the LLM scrambler leaves the registry free for the
    // deterministic scrambler (or nothing) — the two do not interlock.
    entry.register({ pluginConfig: { enabled: false } } as never);
    expect(getEgressStages()).toHaveLength(0);
  });
});
