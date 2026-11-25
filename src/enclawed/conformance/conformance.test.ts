// The shipped self-check (`enclawed conformance`) passes on this build, and
// reports a failing check as FAIL with what to do.

import { describe, expect, it } from "vitest";
import { renderConformanceReport, runConformanceChecks } from "./index.js";

describe("enclawed conformance", () => {
  it("every guarantee holds on this build", async () => {
    const report = await runConformanceChecks();
    const failed = report.results.filter((r) => r.status === "fail");
    expect(failed, renderConformanceReport(report)).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.passed).toBeGreaterThanOrEqual(10);
  }, 120_000);

  it("reports a failing check as FAIL, with what to do, and not ok", async () => {
    const report = await runConformanceChecks({
      only: ["conformance-self-test"],
      extraChecks: [
        {
          id: "conformance-self-test",
          title: "Self test",
          proves: "a failing check is reported",
          remedy: "nothing; this is a test",
          run: async () => {
            throw new Error("deliberate failure");
          },
        },
      ],
    });
    expect(report.ok).toBe(false);
    const text = renderConformanceReport(report);
    expect(text).toContain("FAIL  Self test");
    expect(text).toContain("what to do: nothing; this is a test");
  });
});
