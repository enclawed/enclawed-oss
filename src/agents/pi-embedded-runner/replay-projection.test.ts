import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentMessage, StreamFn } from "@mariozechner/pi-agent-core";
import {
  createAssistantMessageEventStream,
  getCurrentSystemPrompt,
  type AssistantMessage,
  type Message,
  type Model,
  type Api,
} from "@mariozechner/pi-ai";
import { createAgentSession, SessionManager, SettingsManager } from "@mariozechner/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EnclawedPiCredentialStore } from "../pi-credential-store.js";
import { discoverModelRuntime } from "../pi-model-discovery.js";
import {
  capturePriorHistoryBaseline,
  installPriorHistoryProjection,
  projectPriorHistory,
} from "./replay-projection.js";
import { buildReplayPriorView } from "./run/replay-prior-view.js";
import { createEmbeddedPiResourceLoader } from "./session-runtime.js";
import { applySystemPromptOverrideToSession } from "./system-prompt.js";

const model: Model<Api> = {
  id: "test-model",
  name: "test-model",
  api: "openai-completions",
  provider: "openai",
  baseUrl: "http://127.0.0.1:9/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 100_000,
  maxTokens: 256,
};

const zeroUsage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function assistant(content: AssistantMessage["content"], timestamp: number): AssistantMessage {
  return {
    role: "assistant",
    content,
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: zeroUsage,
    stopReason: content.some((block) => block.type === "toolCall") ? "toolUse" : "stop",
    timestamp,
  };
}

function textOf(message: Message): string {
  if (message.role === "system") {
    return getCurrentSystemPrompt([message]);
  }
  if (typeof message.content === "string") {
    return message.content;
  }
  return message.content
    .map((block) => (block.type === "text" ? block.text : block.type))
    .join(" ");
}

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-replay-projection-"));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

// Session history the replay pipeline must rewrite before it reaches the model.
function seedHistory(sessionManager: SessionManager) {
  // An old turn that the DM history limit (1 user turn) must drop.
  const oldTurnId = sessionManager.appendMessage({
    role: "user",
    content: "OLD-TURN-SECRET",
    timestamp: 1,
  });
  sessionManager.appendMessage(assistant([{ type: "text", text: "old reply" }], 2));
  // A relayed message from another session: replay adds the provenance prefix.
  const relayed = {
    role: "user" as const,
    content: "relayed request",
    timestamp: 3,
    provenance: { kind: "inter_session", sourceSessionKey: "agent:main:other" },
  };
  const relayedId = sessionManager.appendMessage(relayed);
  // A tool call to a tool this run does not allow: replay drops it.
  sessionManager.appendMessage(
    assistant(
      [
        { type: "text", text: "calling" },
        { type: "toolCall", id: "call_x", name: "forbidden_tool", arguments: {} },
      ],
      4,
    ),
  );
  sessionManager.appendMessage({
    role: "toolResult",
    toolCallId: "call_x",
    toolName: "forbidden_tool",
    content: [{ type: "text", text: "FORBIDDEN-RESULT" }],
    isError: false,
    timestamp: 5,
  });
  sessionManager.appendMessage(assistant([{ type: "text", text: "done" }], 6));
  return { oldTurnId, relayedId };
}

async function createSession(sessionManager: SessionManager) {
  const agentDir = path.join(tmpRoot, "agent");
  fs.mkdirSync(agentDir, { recursive: true });
  const settingsManager = SettingsManager.inMemory({});
  const { session } = await createAgentSession({
    cwd: tmpRoot,
    agentDir,
    modelRuntime: await discoverModelRuntime(
      new EnclawedPiCredentialStore({ openai: { type: "api_key", key: "k" } }),
      agentDir,
    ),
    model,
    tools: [],
    sessionManager,
    settingsManager,
    resourceLoader: await createEmbeddedPiResourceLoader({
      cwd: tmpRoot,
      agentDir,
      settingsManager,
      extensionFactories: [],
    }),
  });
  const requests: Message[][] = [];
  const capture: StreamFn = (requestModel, context) => {
    requests.push(structuredClone(context.messages));
    const stream = createAssistantMessageEventStream();
    const reply = assistant([{ type: "text", text: "ok" }], Date.now());
    reply.model = requestModel.id;
    queueMicrotask(() => {
      stream.push({ type: "start", partial: reply });
      stream.push({ type: "done", reason: "stop", message: reply });
    });
    return stream;
  };
  session.agent.streamFunction = capture;
  return { session, requests };
}

// The attempt's replay composition (run/replay-prior-view.ts).
async function buildReplayView(
  sessionManager: SessionManager,
  messages: AgentMessage[],
  options: { historyLimit?: number; persistSideEffects?: boolean } = {},
) {
  return await buildReplayPriorView({
    messages,
    sanitize: {
      modelApi: model.api,
      modelId: model.id,
      provider: model.provider,
      allowedToolNames: ["read"],
      sessionManager,
      sessionId: "replay-test",
      persistSideEffects: options.persistSideEffects,
    },
    historyLimit: options.historyLimit,
    repairToolUseResultPairing: true,
  });
}

function installProjection(
  session: Awaited<ReturnType<typeof createSession>>["session"],
  sessionManager: SessionManager,
  historyLimit?: number,
) {
  const fallbacks: string[] = [];
  installPriorHistoryProjection({
    agent: session.agent,
    sessionManager,
    baseline: capturePriorHistoryBaseline({ sessionManager, priorView: session.messages }),
    rebuildPriorView: async (conversation) =>
      await buildReplayView(sessionManager, conversation, {
        historyLimit,
        persistSideEffects: false,
      }),
    onFallback: (reason) => fallbacks.push(reason),
  });
  return fallbacks;
}

function expectSanitized(request: Message[]) {
  const texts = request.map(textOf);
  expect(request[0]?.role).toBe("system");
  expect(texts[0]).toBe("ENCLAWED SYSTEM PROMPT");
  expect(request.filter((message) => message.role === "system")).toHaveLength(1);
  // Inter-session provenance prefix added by replay sanitization.
  expect(texts.some((text) => text.includes("sourceSession=agent:main:other"))).toBe(true);
  // The disallowed replayed tool call and its result are dropped.
  expect(JSON.stringify(request)).not.toContain("forbidden_tool");
  expect(JSON.stringify(request)).not.toContain("FORBIDDEN-RESULT");
}

describe("prior-history projection through a real pi session", () => {
  it("sends Enclawed's replay view to the stream function on every request", async () => {
    const sessionManager = SessionManager.inMemory(tmpRoot);
    seedHistory(sessionManager);
    const { session, requests } = await createSession(sessionManager);
    applySystemPromptOverrideToSession(session, "ENCLAWED SYSTEM PROMPT");

    session.agent.state.messages = await buildReplayView(sessionManager, session.messages, {
      historyLimit: 1,
    });
    const fallbacks = installProjection(session, sessionManager, 1);

    await session.prompt("first question");
    await session.prompt("second question");

    expect(requests).toHaveLength(2);
    for (const request of requests) {
      const texts = request.map(textOf);
      expect(request[0]?.role).toBe("system");
      expect(texts[0]).toBe("ENCLAWED SYSTEM PROMPT");
      expect(request.filter((message) => message.role === "system")).toHaveLength(1);
      // History limit applied: the old turn is gone.
      expect(texts.join("\n")).not.toContain("OLD-TURN-SECRET");
      // Inter-session provenance prefix added by replay sanitization.
      expect(texts.some((text) => text.includes("sourceSession=agent:main:other"))).toBe(true);
      // The disallowed replayed tool call and its result are dropped.
      expect(JSON.stringify(request)).not.toContain("forbidden_tool");
      expect(JSON.stringify(request)).not.toContain("FORBIDDEN-RESULT");
    }
    // The attempt's own messages follow the prior view in order.
    const second = requests[1]?.map(textOf) ?? [];
    expect(second.indexOf("first question")).toBeGreaterThan(0);
    expect(second.indexOf("second question")).toBeGreaterThan(second.indexOf("first question"));
    // Prompt-cache stability: the second request extends the first one byte-for-byte.
    const first = requests[0] ?? [];
    expect(JSON.stringify(requests[1]?.slice(0, first.length))).toBe(JSON.stringify(first));
    expect(fallbacks).toEqual([]);
  });

  for (const change of ["compaction", "context-edit"] as const) {
    it(`fails safe after a mid-attempt ${change}: re-derives and re-caches the sanitized view`, async () => {
      const sessionManager = SessionManager.inMemory(tmpRoot);
      const { oldTurnId, relayedId } = seedHistory(sessionManager);
      const { session, requests } = await createSession(sessionManager);
      applySystemPromptOverrideToSession(session, "ENCLAWED SYSTEM PROMPT");
      session.agent.state.messages = await buildReplayView(sessionManager, session.messages);
      const fallbacks = installProjection(session, sessionManager);

      await session.prompt("first question");
      if (change === "compaction") {
        // Compact away the old turn; the relayed turn and the forbidden call stay raw.
        sessionManager.appendCompaction("Earlier: an old turn.", relayedId, 100);
      } else {
        sessionManager.appendContextEdit(oldTurnId, null);
      }
      await session.prompt("second question");
      await session.prompt("third question");

      expect(requests).toHaveLength(3);
      for (const request of requests) {
        expectSanitized(request);
      }
      // The changed prior part is reflected: the old turn is gone after the change.
      expect(JSON.stringify(requests[1])).not.toContain("OLD-TURN-SECRET");
      // Re-derived once, then reused byte-for-byte by the next request.
      expect(fallbacks).toEqual(["prior-changed"]);
      const second = requests[1] ?? [];
      expect(JSON.stringify(requests[2]?.slice(0, second.length))).toBe(JSON.stringify(second));
    });
  }

  it("refuses the request when the replay view cannot be re-derived", async () => {
    const sessionManager = SessionManager.inMemory(tmpRoot);
    const { oldTurnId } = seedHistory(sessionManager);
    const { session, requests } = await createSession(sessionManager);
    installPriorHistoryProjection({
      agent: session.agent,
      sessionManager,
      baseline: capturePriorHistoryBaseline({ sessionManager, priorView: session.messages }),
      rebuildPriorView: async () => {
        throw new Error("pipeline unavailable");
      },
    });
    sessionManager.appendContextEdit(oldTurnId, null);

    await session.prompt("question");

    // No request reached the provider with unsanitized history.
    expect(requests).toHaveLength(0);
    const last = session.messages.at(-1);
    expect(last?.role).toBe("assistant");
    expect(JSON.stringify(last)).toContain("Refusing model request");
  });

  it("control: without the projection pi rebuilds the raw session history", async () => {
    const sessionManager = SessionManager.inMemory(tmpRoot);
    seedHistory(sessionManager);
    const { session, requests } = await createSession(sessionManager);
    session.agent.state.messages = await buildReplayView(sessionManager, session.messages, {
      historyLimit: 1,
    });

    await session.prompt("first question");

    expect(JSON.stringify(requests[0])).toContain("OLD-TURN-SECRET");
  });
});

describe("projectPriorHistory", () => {
  it("falls back to pi's projection when a prior entry was context-edited", () => {
    const sessionManager = SessionManager.inMemory(tmpRoot);
    const firstId = sessionManager.appendMessage({ role: "user", content: "a", timestamp: 1 });
    sessionManager.appendMessage(assistant([{ type: "text", text: "b" }], 2));
    const baseline = capturePriorHistoryBaseline({
      sessionManager,
      priorView: [{ role: "user", content: "sanitized", timestamp: 1 }],
    });
    sessionManager.appendContextEdit(firstId, null);
    const projection = sessionManager.buildSessionProjection();
    expect(projectPriorHistory({ baseline, projection, messages: projection.messages })).toEqual({
      kind: "prior-changed",
    });
  });

  it("refuses misaligned input instead of guessing the boundary", () => {
    const sessionManager = SessionManager.inMemory(tmpRoot);
    sessionManager.appendMessage({ role: "user", content: "a", timestamp: 1 });
    const baseline = capturePriorHistoryBaseline({
      sessionManager,
      priorView: [{ role: "user", content: "a", timestamp: 1 }],
    });
    const projection = sessionManager.buildSessionProjection();
    expect(projectPriorHistory({ baseline, projection, messages: [] })).toEqual({
      kind: "misaligned",
    });
  });
});
