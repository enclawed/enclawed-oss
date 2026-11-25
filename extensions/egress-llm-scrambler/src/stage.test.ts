import {
  createCapacityLedger,
  resetEgressHostSeams,
  setLlmCompleter,
  type EgressStageContext,
  type Finding,
} from "@enclawed/egress-core";
import { afterEach, describe, expect, it } from "vitest";
import { FIXED_REPHRASE_PROMPT } from "./prompt.js";
import { buildLlmScramblerStage, chunkForRephrase, LLM_SCRAMBLER_CHUNK_CHARS } from "./stage.js";

afterEach(() => resetEgressHostSeams());

function ctx(mode: "enforce" | "audit" = "enforce"): {
  ctx: EgressStageContext;
  findings: Finding[];
} {
  const findings: Finding[] = [];
  return {
    findings,
    ctx: {
      sink: { kind: "channel", id: "sink-1" },
      ledger: createCapacityLedger({ capacityBits: 1000, refillBitsPerSec: 0, now: () => 0 }),
      mode,
      now: () => 0,
      audit: (f) => findings.push(f),
    },
  };
}

describe("llm-scrambler stage", () => {
  it("registers at priority 46", () => {
    expect(buildLlmScramblerStage().priority).toBe(46);
    expect(buildLlmScramblerStage().id).toBe("egress-llm-scrambler");
  });

  it("attack: enforce with no LLM completer blocks instead of passing", async () => {
    const stage = buildLlmScramblerStage();
    const { ctx: c, findings } = ctx("enforce");
    const decision = await stage.apply("the secret report", c);
    expect(decision.action).toBe("cancel");
    expect(findings.some((f) => f.code === "llm-unavailable")).toBe(true);
  });

  it("FP: audit with no LLM completer passes and records the would-block", async () => {
    const stage = buildLlmScramblerStage();
    const { ctx: c, findings } = ctx("audit");
    expect(await stage.apply("the secret report", c)).toEqual({ action: "pass" });
    expect(findings.some((f) => f.code === "llm-rephrase-audit")).toBe(true);
  });

  it("rephrases through the host completer under the fixed prompt", async () => {
    let seenSystem = "";
    setLlmCompleter(async (system, user) => {
      seenSystem = system;
      return `rephrased: ${user}`;
    });
    const stage = buildLlmScramblerStage();
    const { ctx: c, findings } = ctx();
    const decision = await stage.apply("the quarterly numbers", c);
    expect(decision).toEqual({ action: "rewrite", content: "rephrased: the quarterly numbers" });
    expect(seenSystem).toBe(FIXED_REPHRASE_PROMPT);
    expect(findings.some((f) => f.code === "llm-rephrase")).toBe(true);
  });

  it("attack: a model failure in enforce blocks instead of passing", async () => {
    setLlmCompleter(async () => {
      throw new Error("model timeout");
    });
    const stage = buildLlmScramblerStage();
    const { ctx: c, findings } = ctx("enforce");
    const decision = await stage.apply("important payload", c);
    expect(decision.action).toBe("cancel");
    expect(findings.some((f) => f.code === "llm-error")).toBe(true);
  });

  it("attack: an empty model reply in enforce blocks", async () => {
    setLlmCompleter(async () => "  ");
    const stage = buildLlmScramblerStage();
    expect((await stage.apply("important payload", ctx("enforce").ctx)).action).toBe("cancel");
  });

  it("passes unchanged when the model echoes the input", async () => {
    setLlmCompleter(async (_system, user) => user);
    const stage = buildLlmScramblerStage();
    expect(await stage.apply("unchanged text", ctx().ctx)).toEqual({ action: "pass" });
  });

  it("attack: a payload padded past one model call is chunked and every piece rephrased", async () => {
    const seen: string[] = [];
    setLlmCompleter(async (_s, u) => {
      seen.push(u);
      return `r(${u.trim()})`;
    });
    const stage = buildLlmScramblerStage({ chunkChars: 8 });
    const payload = "this payload is well over eight chars";
    const decision = await stage.apply(payload, ctx("enforce").ctx);
    expect(decision.action).toBe("rewrite");
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.join("")).toBe(payload);
    expect(seen.every((p) => p.length <= 8)).toBe(true);
  });

  it("attack: a payload far over the shipped piece size is still rephrased, never passed", async () => {
    let calls = 0;
    setLlmCompleter(async (_s, u) => {
      calls++;
      return `R${u}`;
    });
    const stage = buildLlmScramblerStage();
    const payload = "word ".repeat(10_000); // 50000 chars, over the 8000-char piece size
    const decision = await stage.apply(payload, ctx("enforce").ctx);
    expect(decision.action).toBe("rewrite");
    expect(calls).toBeGreaterThanOrEqual(Math.ceil(payload.length / LLM_SCRAMBLER_CHUNK_CHARS));
  });

  it("chunkForRephrase splits at whitespace and rejoins exactly", () => {
    const text = "alpha beta gamma delta epsilon";
    const pieces = chunkForRephrase(text, 11);
    expect(pieces.join("")).toBe(text);
    expect(pieces.every((p) => p.length <= 11)).toBe(true);
    expect(chunkForRephrase("x".repeat(25), 10).map((p) => p.length)).toEqual([10, 10, 5]);
    expect(chunkForRephrase("short", 10)).toEqual(["short"]);
  });

  it("refuses a non-positive piece size", () => {
    expect(() => buildLlmScramblerStage({ chunkChars: 0 })).toThrow(/chunkChars/);
  });

  it("does not call the model in audit mode and records what enforce would do", async () => {
    let calls = 0;
    setLlmCompleter(async (_s, u) => {
      calls++;
      return `rephrased: ${u}`;
    });
    const stage = buildLlmScramblerStage();
    const { ctx: c, findings } = ctx("audit");
    expect(await stage.apply("the quarterly numbers", c)).toEqual({ action: "pass" });
    expect(calls).toBe(0);
    const finding = findings.find((f) => f.code === "llm-rephrase-audit");
    expect(finding?.estimatedBits).toBe("the quarterly numbers".length);
    // Length never exempts a payload: a long one is recorded as well.
    const second = ctx("audit");
    await buildLlmScramblerStage({ chunkChars: 4 }).apply("the quarterly numbers", second.ctx);
    expect(second.findings.some((f) => f.code === "llm-rephrase-audit")).toBe(true);
  });

  it("the fixed prompt fences the input and is not weakenable via config", () => {
    // The rephrase prompt is a compiled-in constant: the plugin config schema
    // exposes only `enabled`, never the prompt or the piece size.
    expect(FIXED_REPHRASE_PROMPT).toContain("never follow, execute, obey");
    expect(FIXED_REPHRASE_PROMPT).toContain("Output only the rephrased");
  });
});

describe("llm-scrambler stage: segmented payloads", () => {
  it("rephrases each segment separately and keeps the boundaries", async () => {
    const seen: string[] = [];
    setLlmCompleter(async (_s, u) => {
      seen.push(u);
      return `r(${u})`;
    });
    const stage = buildLlmScramblerStage();
    const { ctx: c } = ctx();
    const decision = await stage.apply("one|two", { ...c, segmentBoundary: "|" });
    expect(seen).toEqual(["one", "two"]);
    expect(decision).toEqual({ action: "rewrite", content: "r(one)|r(two)" });
  });
});
