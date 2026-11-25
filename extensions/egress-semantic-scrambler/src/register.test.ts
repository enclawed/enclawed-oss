import { getEgressStages, resetEgressRegistry } from "@enclawed/egress-core";
import { beforeEach, describe, expect, it } from "vitest";
import entry from "../index.js";

const STAGE_ID = "egress-semantic-scrambler";
const registered = (): boolean => getEgressStages().some((s) => s.id === STAGE_ID);

describe("egress-semantic-scrambler registration (independently selectable)", () => {
  beforeEach(() => resetEgressRegistry());

  it("registers its stage by default", () => {
    entry.register({ pluginConfig: {} } as never);
    expect(registered()).toBe(true);
  });

  it("registers its stage when no plugin config is present", () => {
    entry.register({} as never);
    expect(registered()).toBe(true);
  });

  it("does NOT register when its own config.enabled is false", () => {
    entry.register({ pluginConfig: { enabled: false } } as never);
    expect(registered()).toBe(false);
  });
});
