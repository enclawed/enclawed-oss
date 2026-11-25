import { describe, expect, it } from "vitest";
import { createReplaySentinel, estimateDiffBits, skeleton } from "./replay.js";

describe("skeleton", () => {
  it("strips cosmetic dimensions", () => {
    expect(skeleton("Status: OK")).toBe(skeleton("status:   ok."));
  });
  it("keeps semantically distinct payloads distinct", () => {
    expect(skeleton("order 4821 shipped")).not.toBe(skeleton("order 9133 shipped"));
  });
});

describe("estimateDiffBits", () => {
  it("counts differing and extra characters", () => {
    expect(estimateDiffBits("abc", "abc")).toBe(0);
    expect(estimateDiffBits("abc", "abcd")).toBe(1);
    expect(estimateDiffBits("abc", "abX")).toBe(1);
  });
});

describe("replay sentinel", () => {
  it("flags a repeat with cosmetic-only variation", () => {
    const sentinel = createReplaySentinel();
    expect(sentinel.inspect("sink-1", "Status: OK").findings).toHaveLength(0);
    const second = sentinel.inspect("sink-1", "Status: OK.");
    expect(second.findings.some((f) => f.code === "replay-divergence")).toBe(true);
  });

  it("does not flag an exact repeat (no covert variation)", () => {
    const sentinel = createReplaySentinel();
    sentinel.inspect("sink-1", "Status: OK");
    expect(sentinel.inspect("sink-1", "Status: OK").findings).toHaveLength(0);
  });

  it("does not flag semantically different messages", () => {
    const sentinel = createReplaySentinel();
    sentinel.inspect("sink-1", "order 4821 shipped");
    expect(sentinel.inspect("sink-1", "order 9133 shipped").findings).toHaveLength(0);
  });

  it("scopes replay history per sink", () => {
    const sentinel = createReplaySentinel();
    sentinel.inspect("sink-1", "Status: OK");
    expect(sentinel.inspect("sink-2", "Status: OK.").findings).toHaveLength(0);
  });
});

describe("replay sentinel — bounded sink map", () => {
  it("evicts only the least recently used sink at the cap", () => {
    const sentinel = createReplaySentinel({ maxSinks: 2 });
    sentinel.inspect("victim", "Status: OK");
    sentinel.inspect("other", "hello");
    sentinel.inspect("victim", "Status: OK");
    sentinel.inspect("new", "hi");
    expect(sentinel.inspect("victim", "Status: OK.").findings).toHaveLength(1);
  });
});
