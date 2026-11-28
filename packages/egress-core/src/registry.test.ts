import { beforeEach, describe, expect, it } from "vitest";
import { getEgressStages, registerEgressStage, resetEgressRegistry } from "./registry.js";
import type { EgressStage } from "./types.js";

const stage = (id: string, priority: number, kinds: EgressStage["kinds"]): EgressStage => ({
  id,
  priority,
  kinds,
  apply: () => ({ action: "pass" }),
});

describe("egress stage registry", () => {
  beforeEach(() => resetEgressRegistry());

  it("returns stages sorted by ascending priority", () => {
    registerEgressStage(stage("c", 50, ["channel"]));
    registerEgressStage(stage("a", 10, ["channel"]));
    registerEgressStage(stage("b", 30, ["channel"]));
    expect(getEgressStages("channel").map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("filters by sink kind", () => {
    registerEgressStage(stage("chan", 10, ["channel"]));
    registerEgressStage(stage("tool", 20, ["tool-call"]));
    expect(getEgressStages("channel").map((s) => s.id)).toEqual(["chan"]);
    expect(getEgressStages("tool-call").map((s) => s.id)).toEqual(["tool"]);
  });

  it("re-registering an id replaces the prior stage (idempotent reload)", () => {
    registerEgressStage(stage("dup", 10, ["channel"]));
    registerEgressStage(stage("dup", 99, ["channel"]));
    const stages = getEgressStages("channel");
    expect(stages).toHaveLength(1);
    expect(stages[0]?.priority).toBe(99);
  });

  it("unregister removes only the registered instance", () => {
    const unregister = registerEgressStage(stage("x", 10, ["channel"]));
    expect(getEgressStages("channel")).toHaveLength(1);
    unregister();
    expect(getEgressStages("channel")).toHaveLength(0);
  });
});
