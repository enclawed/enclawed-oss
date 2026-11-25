import { afterEach, describe, expect, it } from "vitest";
import { classifyToolCall, publishToolCapabilityClassifier } from "./tool-capability-map.js";

const KEY = Symbol.for("enclawed.tool-capability-classifier");
type Slot = { classify: ((toolId: string) => unknown) | null };
const globals = globalThis as unknown as Record<symbol, Slot | undefined>;

describe("publishToolCapabilityClassifier", () => {
  const before = globals[KEY]?.classify ?? null;
  afterEach(() => {
    if (globals[KEY]) {
      globals[KEY].classify = before;
    }
  });

  it("publishes classifyToolCall on the shared slot, keeping an existing slot object", () => {
    const slot: Slot = { classify: null };
    globals[KEY] = slot;
    publishToolCapabilityClassifier();
    expect(globals[KEY]).toBe(slot);
    expect(slot.classify).toBe(classifyToolCall);
    expect(slot.classify?.("web_fetch")).toEqual(classifyToolCall("web_fetch"));
  });
});
