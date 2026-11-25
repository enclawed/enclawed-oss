import { llmComplete, resetEgressHostSeams, setLlmCompleter } from "@enclawed/egress-core";
import { afterEach, describe, expect, it } from "vitest";
import { createRuntimeLlmCompleter } from "./host-wiring.js";

// Audit follow-up: what the LLM scrambler does when `llm.timeoutMs` expires.
// The completer must fail (never return a partial or error reply); the stage
// turns that failure into a block in enforce mode (see
// extensions/egress-llm-scrambler/src/stage.test.ts, "a model failure").

type RunParams = { abortSignal?: AbortSignal; timeoutMs?: number };
type RunFn = (params: RunParams) => Promise<unknown>;

function completerWith(run: RunFn, timeoutMs = 50) {
  const api = {
    config: {},
    runtime: { agent: { runEmbeddedPiAgent: run } },
  } as unknown as Parameters<typeof createRuntimeLlmCompleter>[0];
  return createRuntimeLlmCompleter(api, { enabled: true, timeoutMs });
}

const ok = (text: string) => ({ payloads: [{ text }], meta: { durationMs: 1 } });

afterEach(() => {
  resetEgressHostSeams();
});

describe("runtime LLM completer deadline", () => {
  it("attack: a turn that outlives timeoutMs is aborted and the completer throws", async () => {
    let signal: AbortSignal | undefined;
    const complete = completerWith(async (params) => {
      signal = params.abortSignal;
      // Never settles on its own: only the deadline can end the wait.
      return await new Promise(() => {});
    }, 30);
    await expect(complete("sys", "hello")).rejects.toThrow(/no reply within 30 ms/);
    expect(signal?.aborted).toBe(true);
  });

  it("attack: an aborted turn, an error, or an error payload is not a rephrase", async () => {
    const results = [
      { payloads: [{ text: "partial reph" }], meta: { durationMs: 1, aborted: true } },
      {
        payloads: [{ text: "partial" }],
        meta: { durationMs: 1, error: { kind: "retry_limit", message: "x" } },
      },
      { payloads: [{ text: "Request timed out", isError: true }], meta: { durationMs: 1 } },
      {
        payloads: [{ text: "half" }, { text: "Request timed out", isError: true }],
        meta: { durationMs: 1 },
      },
    ];
    for (const result of results) {
      const complete = completerWith(async () => result);
      await expect(complete("sys", "hello")).rejects.toThrow(/egress LLM completer/);
    }
  });

  it("FP: a complete reply inside the deadline is returned", async () => {
    const complete = completerWith(async (params) => {
      expect(params.timeoutMs).toBe(50);
      return ok("rephrased");
    });
    await expect(complete("sys", "hello")).resolves.toBe("rephrased");
    setLlmCompleter(complete);
    await expect(llmComplete("sys", "hello")).resolves.toBe("rephrased");
  });
});
