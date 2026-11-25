// `enclawed conformance`: the product's own self-check of the security
// guarantees it makes, run against the installed build.
//
// Every check runs in this process against the real gate, egress, MCP
// admission, approval and file-target code, with throwaway temp directories,
// a local child-process MCP server and an in-memory audit sink. A check never
// reads or writes the user's configuration or state, never uses the network
// and never opens a hardware device: the process runtime (policy, audit log)
// is swapped for a sandbox one while a check runs and restored afterwards.

import { getRuntime, setRuntime, clearRuntime, type EnclawedRuntime } from "../runtime.js";
import type { ConformanceCheck, ConformanceCheckResult, ConformanceReport } from "./types.js";

export type {
  ConformanceCheck,
  ConformanceCheckResult,
  ConformanceReport,
  ConformanceStatus,
} from "./types.js";
export { ConformanceSkip } from "./types.js";

const CHECK_TIMEOUT_MS = 60_000;

async function loadDefaultChecks(): Promise<ConformanceCheck[]> {
  const [mcp, approval, egress, platform, skills, contained, review, shell] = await Promise.all([
    import("./checks-mcp.js"),
    import("./checks-approval.js"),
    import("./checks-egress.js"),
    import("./checks-platform.js"),
    import("./checks-skills.js"),
    import("./checks-contained.js"),
    import("./checks-review.js"),
    import("./checks-shell.js"),
  ]);
  return [
    ...mcp.CHECKS,
    ...approval.CHECKS,
    ...egress.CHECKS,
    ...platform.CHECKS,
    ...skills.CHECKS,
    ...contained.CHECKS,
    ...review.CHECKS,
    ...shell.CHECKS,
  ];
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
      timer.unref?.();
    }),
  ]);
}

/** Run every check (or the listed ones) and report each outcome. */
export async function runConformanceChecks(
  opts: { only?: readonly string[]; extraChecks?: readonly ConformanceCheck[] } = {},
): Promise<ConformanceReport> {
  const all = [...(await loadDefaultChecks()), ...(opts.extraChecks ?? [])];
  const selected = opts.only?.length ? all.filter((c) => opts.only?.includes(c.id)) : all;
  const results: ConformanceCheckResult[] = [];
  for (const check of selected) {
    const saved: EnclawedRuntime | null = getRuntime();
    const started = Date.now();
    let result: ConformanceCheckResult;
    try {
      const outcome = await withTimeout(Promise.resolve().then(check.run), CHECK_TIMEOUT_MS);
      result = outcome?.skip
        ? {
            id: check.id,
            title: check.title,
            proves: check.proves,
            status: "skip",
            detail: outcome.skip,
          }
        : { id: check.id, title: check.title, proves: check.proves, status: "pass" };
    } catch (err) {
      result = {
        id: check.id,
        title: check.title,
        proves: check.proves,
        status: "fail",
        detail: err instanceof Error ? err.message : String(err),
        remedy: check.remedy,
      };
    } finally {
      // A check swaps the process runtime for a sandbox one; put it back.
      if (saved) {
        setRuntime(saved);
      } else {
        clearRuntime();
      }
    }
    results.push({ ...result, durationMs: Date.now() - started });
  }
  return {
    ok: results.every((r) => r.status !== "fail"),
    passed: results.filter((r) => r.status === "pass").length,
    failed: results.filter((r) => r.status === "fail").length,
    skipped: results.filter((r) => r.status === "skip").length,
    results,
  };
}

/** One line per guarantee, in plain terms. */
export function renderConformanceReport(report: ConformanceReport): string {
  const lines: string[] = [];
  for (const r of report.results) {
    const tag = r.status === "pass" ? "PASS" : r.status === "fail" ? "FAIL" : "SKIP";
    lines.push(`${tag}  ${r.title}: ${r.proves}`);
    if (r.status === "fail") {
      lines.push(`      what failed: ${r.detail ?? "unknown"}`);
      if (r.remedy) {
        lines.push(`      what to do: ${r.remedy}`);
      }
    } else if (r.status === "skip" && r.detail) {
      lines.push(`      note: ${r.detail}`);
    }
  }
  lines.push("");
  lines.push(
    report.ok
      ? `All ${report.passed} guarantees hold on this installation${report.skipped ? ` (${report.skipped} skipped)` : ""}.`
      : `${report.failed} of ${report.results.length} guarantees do NOT hold on this installation.`,
  );
  return lines.join("\n");
}
