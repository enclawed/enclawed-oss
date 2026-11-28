import { describe, expect, it } from "vitest";
import { argumentBoundary, mediateArguments } from "./payload.js";

const pass = async (text: string) => ({ cancelled: false as const, content: text });

describe("mediateArguments (one pipeline run per tool call)", () => {
  it("calls the pipeline once for all string leaves and reassembles the structure", async () => {
    const seen: string[] = [];
    const out = await mediateArguments(
      { to: "u1", body: { text: "hi", tags: ["a", "", "b"] }, n: 3 },
      async (text) => {
        seen.push(text);
        return { cancelled: false, content: text.toUpperCase() };
      },
      () => "12345",
    );
    expect(seen).toEqual([["u1", "hi", "a", "b"].join(argumentBoundary("12345"))]);
    expect(out).toEqual({
      cancelled: false,
      changed: true,
      value: { to: "U1", body: { text: "HI", tags: ["A", "", "B"] }, n: 3 },
    });
  });

  it("does not call the pipeline when there are no strings", async () => {
    let calls = 0;
    const value = { n: 1, list: [2, null] };
    const out = await mediateArguments(value, async (t) => {
      calls++;
      return pass(t);
    });
    expect(calls).toBe(0);
    expect(out).toEqual({ cancelled: false, changed: false, value });
  });

  it("returns the original value object when nothing changed", async () => {
    const value = { a: "x", b: "y" };
    const out = await mediateArguments(value, pass);
    expect(out).toEqual({ cancelled: false, changed: false, value });
    expect(out.cancelled ? undefined : out.value).toBe(value);
  });

  it("propagates a cancel", async () => {
    const out = await mediateArguments({ a: "x" }, async () => ({
      cancelled: true,
      reason: "tainted",
    }));
    expect(out).toEqual({ cancelled: true, reason: "tainted" });
  });

  it("blocks when a rewrite loses a boundary", async () => {
    const out = await mediateArguments({ a: "x", b: "y" }, async () => ({
      cancelled: false,
      content: "merged",
    }));
    expect(out.cancelled).toBe(true);
  });

  it("picks a new boundary when an argument happens to contain it", async () => {
    const nonces = ["111", "222"];
    const seen: string[] = [];
    await mediateArguments(
      { a: `x${argumentBoundary("111")}y`, b: "z" },
      async (t) => {
        seen.push(t);
        return { cancelled: false, content: `${t}!` };
      },
      () => nonces.shift() ?? "333",
    );
    expect(seen[0]).toContain(argumentBoundary("222"));
  });
});
