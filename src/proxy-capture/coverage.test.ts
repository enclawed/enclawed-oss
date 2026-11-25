import { describe, expect, it } from "vitest";
import { buildDebugProxyCoverageReport } from "./coverage.js";

describe("debug proxy coverage report", () => {
  it("summarizes captured transport seams", () => {
    const report = buildDebugProxyCoverageReport();

    expect(report.summary.total).toBe(report.entries.length);
    expect(report.summary.captured).toBeGreaterThan(0);
    expect(report.summary.captured + report.summary.proxyOnly + report.summary.uncovered).toBe(
      report.summary.total,
    );
    expect(report.entries.some((entry) => entry.id === "provider-transport-fetch")).toBe(true);
  });
});
