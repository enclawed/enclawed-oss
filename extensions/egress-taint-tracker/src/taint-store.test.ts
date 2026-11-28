import { describe, expect, it } from "vitest";
import { createTaintStore } from "./taint-store.js";

describe("taint store", () => {
  it("detects a tagged value leaving in the egress text", () => {
    const store = createTaintStore();
    store.tag("conv-1", "SuperSecretTokenValue-9920", "db-credential");
    const check = store.check("conv-1", "here you go: SuperSecretTokenValue-9920 done");
    expect(check.tainted).toBe(true);
    expect(check.matched).toContain("db-credential");
  });

  it("detects a tagged value despite a change of case", () => {
    const store = createTaintStore();
    store.tag("conv-1", "SuperSecretTokenValue-9920");
    const check = store.check("conv-1", "supersecrettokenvalue-9920");
    expect(check.tainted).toBe(true);
  });

  it("does not taint unrelated text", () => {
    const store = createTaintStore();
    store.tag("conv-1", "SuperSecretTokenValue-9920");
    expect(store.check("conv-1", "the weather is nice today").tainted).toBe(false);
  });

  it("scopes taint per conversation", () => {
    const store = createTaintStore();
    store.tag("conv-1", "SuperSecretTokenValue-9920");
    expect(store.check("conv-2", "SuperSecretTokenValue-9920").tainted).toBe(false);
  });

  it("ignores values below the minimum length", () => {
    const store = createTaintStore({ minValueLength: 12 });
    store.tag("conv-1", "short");
    expect(store.check("conv-1", "short").tainted).toBe(false);
  });

  it("bounds the number of scopes", () => {
    const store = createTaintStore({ maxScopes: 4 });
    for (let i = 0; i < 12; i++) {
      store.tag(`conv-${i}`, "SensitiveValue-000000");
    }
    expect(store.size()).toBeLessThanOrEqual(4);
  });
});
