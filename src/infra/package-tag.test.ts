import { describe, expect, it } from "vitest";
import { normalizePackageTagInput } from "./package-tag.js";

describe("normalizePackageTagInput", () => {
  const packageNames = ["enclawed", "@enclawed/plugin"] as const;

  it.each([
    { input: undefined, expected: null },
    { input: "   ", expected: null },
    { input: "enclawed@beta", expected: "beta" },
    { input: "@enclawed/plugin@2026.2.24", expected: "2026.2.24" },
    { input: "enclawed@   ", expected: null },
    { input: "enclawed", expected: null },
    { input: " @enclawed/plugin ", expected: null },
    { input: " latest ", expected: "latest" },
    { input: "@other/plugin@beta", expected: "@other/plugin@beta" },
    { input: "enclaweder@beta", expected: "enclaweder@beta" },
  ] satisfies ReadonlyArray<{ input: string | undefined; expected: string | null }>)(
    "normalizes %j",
    ({ input, expected }) => {
      expect(normalizePackageTagInput(input, packageNames)).toBe(expected);
    },
  );
});
