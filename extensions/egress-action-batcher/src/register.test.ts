import { getActionBatcher, resetActionBatcher } from "@enclawed/egress-core";
import { afterEach, describe, expect, it } from "vitest";
import { registerConfiguredActionBatcher } from "./register.js";

describe("egress-action-batcher registration", () => {
  afterEach(() => resetActionBatcher());

  it("registers a batcher with the safe defaults", () => {
    const batcher = registerConfiguredActionBatcher(undefined);
    expect(getActionBatcher()).toBe(batcher);
    expect(batcher?.options).toMatchObject({
      canonicalOrder: true,
      collapseIdempotentRepeats: true,
      padding: { enabled: false },
    });
  });

  it("applies admin options, refuses weakening ones, and registers nothing when disabled", () => {
    const batcher = registerConfiguredActionBatcher({
      windowMs: 500,
      padding: { enabled: true, allowedSet: ["https://a.test/"] },
    });
    expect(batcher?.options.windowMs).toBe(500);
    expect(batcher?.options.canonicalOrder).toBe(true);
    expect(batcher?.options.padding.allowedSet).toHaveLength(1);
    resetActionBatcher();
    expect(() => registerConfiguredActionBatcher({ canonicalOrder: false })).toThrow();
    resetActionBatcher();
    expect(registerConfiguredActionBatcher({ enabled: false })).toBeNull();
    expect(getActionBatcher()).toBeNull();
  });
});
