import { createCapacityLedger, type EgressStageContext, type Finding } from "@enclawed/egress-core";
import { describe, expect, it } from "vitest";
import { buildEntropyScannerStage } from "./stage.js";

const base64Blob = Buffer.from("exfiltrated secret payload bytes ".repeat(8)).toString("base64");

function makeCtx(mode: "enforce" | "audit", capacityBits: number) {
  const findings: Finding[] = [];
  const ledger = createCapacityLedger({ capacityBits, refillBitsPerSec: 0, now: () => 0 });
  const ctx: EgressStageContext = {
    sink: { kind: "channel", id: "sink-1" },
    ledger,
    mode,
    now: () => 0,
    audit: (f) => findings.push(f),
  };
  return { ctx, findings, ledger };
}

describe("entropy-scanner stage", () => {
  it("registers at priority 30", () => {
    expect(buildEntropyScannerStage().priority).toBe(30);
  });

  it("passes clean text", async () => {
    const stage = buildEntropyScannerStage();
    const { ctx } = makeCtx("audit", 10_000);
    expect(await stage.apply("normal chat message", ctx)).toEqual({ action: "pass" });
  });

  it("audit mode records covert bits on the ledger but never cancels", async () => {
    const stage = buildEntropyScannerStage();
    const { ctx, ledger, findings } = makeCtx("audit", 10_000);
    const decision = await stage.apply(`file: ${base64Blob}`, ctx);
    expect(decision).toEqual({ action: "pass" });
    expect(ledger.observedTotal()).toBeGreaterThan(0);
    expect(findings.some((f) => f.code === "base64-blob")).toBe(true);
  });

  it("enforce mode cancels when the covert-capacity budget is exhausted", async () => {
    const stage = buildEntropyScannerStage();
    const { ctx } = makeCtx("enforce", 32); // tiny budget
    const decision = await stage.apply(`file: ${base64Blob}`, ctx);
    expect(decision.action).toBe("cancel");
  });

  it("enforce mode passes when the budget can absorb the payload", async () => {
    const stage = buildEntropyScannerStage();
    const { ctx } = makeCtx("enforce", 1_000_000);
    const decision = await stage.apply(`file: ${base64Blob}`, ctx);
    expect(decision).toEqual({ action: "pass" });
  });
});
