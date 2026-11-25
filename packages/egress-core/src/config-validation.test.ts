import { describe, expect, it } from "vitest";
import { createPluginConfigReader } from "./config-validation.js";

describe("createPluginConfigReader", () => {
  it("returns fallbacks for omitted keys", () => {
    const r = createPluginConfigReader("p", undefined, ["a", "b", "c"]);
    expect(r.bool("a", true)).toBe(true);
    expect(r.number("b", 7)).toBe(7);
    expect(r.oneOf("c", ["x", "y"] as const, "y")).toBe("y");
    expect(r.has("a")).toBe(false);
  });

  it("reads valid values", () => {
    const r = createPluginConfigReader("p", { a: false, b: 3, c: "x" }, ["a", "b", "c"]);
    expect(r.bool("a", true)).toBe(false);
    expect(r.number("b", 7, { min: 0, integer: true })).toBe(3);
    expect(r.oneOf("c", ["x", "y"] as const, "y")).toBe("x");
  });

  it("refuses unknown keys, wrong types and out-of-range values", () => {
    expect(() => createPluginConfigReader("p", { zzz: 1 }, ["a"])).toThrow(
      /p: invalid config: unknown option\(s\): zzz/,
    );
    expect(() => createPluginConfigReader("p", [], ["a"])).toThrow(/must be an object/);
    const r = createPluginConfigReader("p", { a: "yes", b: -1, c: "z", d: 1.5, e: Number.NaN }, [
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
    expect(() => r.bool("a", true)).toThrow(/a must be a boolean/);
    expect(() => r.number("b", 1, { min: 0 })).toThrow(/b must be a number >= 0/);
    expect(() => r.oneOf("c", ["x", "y"] as const, "x")).toThrow(/c must be one of x, y/);
    expect(() => r.number("d", 1, { integer: true })).toThrow(/d must be an integer/);
    expect(() => r.number("e", 1)).toThrow(/e must be a number/);
  });

  it("applies exclusive bounds", () => {
    const r = createPluginConfigReader("p", { a: 0, b: 1 }, ["a", "b"]);
    expect(() => r.number("a", 1, { above: 0 })).toThrow(/> 0/);
    expect(() => r.number("b", 0.5, { below: 1 })).toThrow(/< 1/);
  });
});
