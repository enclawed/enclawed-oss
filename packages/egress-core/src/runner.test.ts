import { afterEach, describe, expect, it } from "vitest";
import { registerEgressStage, resetEgressRegistry } from "./registry.js";
import { createEgressRunner } from "./runner.js";
import type { EgressStage } from "./types.js";

const stage = (id: string, priority: number, fn: (s: string) => string): EgressStage => ({
  id,
  priority,
  kinds: ["model-input"],
  apply: (content) => ({ action: "rewrite", content: fn(content) }),
});

afterEach(() => resetEgressRegistry());

describe("createEgressRunner", () => {
  it("runs a fixed stage list in priority order with the staged posture", async () => {
    const run = createEgressRunner({
      stages: [
        stage("egress-noise-injector", 40, (s) => `${s}!`),
        stage("egress-canonicalizer", 10, (s) => s.trim()),
      ],
    });
    // The canonicalizer enforces by default; the noise injector audits.
    const out = await run("  hi  ", { kind: "model-input", id: "app" });
    expect(out).toMatchObject({ cancelled: false, content: "hi" });
    expect(run.audit.records().some((r) => r.finding.code === "rewrite-suppressed-audit")).toBe(
      true,
    );
  });

  it("honors per-stage overrides", async () => {
    const run = createEgressRunner({
      config: { stages: { "egress-noise-injector": { mode: "enforce" } } },
      stages: [stage("egress-noise-injector", 40, (s) => `${s}!`)],
    });
    expect(await run("hi", { kind: "model-input", id: "app" })).toMatchObject({ content: "hi!" });
  });

  it("skips stages that do not apply to the sink kind", async () => {
    const run = createEgressRunner({ stages: [stage("egress-canonicalizer", 10, () => "x")] });
    expect(await run("hi", { kind: "tool-call", id: "app" })).toMatchObject({ content: "hi" });
  });

  it("drains the shared registry when no stage list is given", async () => {
    const run = createEgressRunner();
    registerEgressStage(stage("egress-canonicalizer", 10, (s) => s.toUpperCase()));
    expect(await run("hi", { kind: "model-input", id: "app" })).toMatchObject({ content: "HI" });
  });

  it("is a pass-through when disabled", async () => {
    const run = createEgressRunner({
      config: { enabled: false },
      stages: [stage("egress-canonicalizer", 10, () => "x")],
    });
    expect(await run("hi", { kind: "model-input", id: "app" })).toMatchObject({ content: "hi" });
  });
});
