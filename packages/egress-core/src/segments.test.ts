import { describe, expect, it } from "vitest";
import { mapSegments, mapSegmentsAsync } from "./segments.js";

describe("mapSegments", () => {
  it("applies the transform to the whole payload when unsegmented", () => {
    expect(mapSegments("a|b", {}, (s) => `[${s}]`)).toBe("[a|b]");
  });

  it("applies the transform per segment and keeps the boundaries", async () => {
    expect(mapSegments("a|b|c", { segmentBoundary: "|" }, (s) => s.toUpperCase())).toBe("A|B|C");
    expect(await mapSegmentsAsync("a|b", { segmentBoundary: "|" }, async (s) => `${s}!`)).toBe(
      "a!|b!",
    );
  });
});
