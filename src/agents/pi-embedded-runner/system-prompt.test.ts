import type { Agent, AgentMessage } from "@mariozechner/pi-agent-core";
import { getCurrentSystemPrompt, getCurrentTools, type Tool } from "@mariozechner/pi-ai";
import { afterEach, describe, expect, it } from "vitest";
import { clearMemoryPluginState, registerMemoryPromptSection } from "../../plugins/memory-state.js";
import {
  applySystemPromptOverrideToSession,
  buildEmbeddedSystemPrompt,
  createSystemPromptOverride,
  projectSystemPromptOntoMessages,
} from "./system-prompt.js";

type MockSession = { agent: Pick<Agent, "transformContext"> };

const readTool: Tool = {
  name: "read",
  description: "Read a file",
  parameters: { type: "object", properties: { path: { type: "string" } } },
};
const execTool: Tool = {
  name: "exec",
  description: "Run a command",
  parameters: { type: "object", properties: { command: { type: "string" } } },
};

// A pi >= 0.87 session transcript: pi's own structured prompt sections, a
// tool declaration, a later section patch and a later tool addition.
function createTranscript(): AgentMessage[] {
  return [
    {
      role: "system",
      content: "",
      sections: { preamble: "pi default preamble", cwd: "<cwd>\n/work\n</cwd>" },
      timestamp: 11,
    },
    { role: "system", content: "", toolsAdded: [readTool], timestamp: 12 },
    { role: "user", content: [{ type: "text", text: "hello" }], timestamp: 13 },
    { role: "system", content: "", sections: { cwd: "<cwd>\n/other\n</cwd>" }, timestamp: 14 },
    { role: "system", content: "", toolsAdded: [execTool], timestamp: 15 },
    { role: "user", content: [{ type: "text", text: "again" }], timestamp: 16 },
  ];
}

async function project(session: MockSession, messages: AgentMessage[]) {
  const transform = session.agent.transformContext;
  if (!transform) {
    throw new Error("expected a transformContext projection");
  }
  return await transform(messages);
}

describe("applySystemPromptOverrideToSession", () => {
  it("sends exactly the override as the only system prompt, with the current tools", async () => {
    const session: MockSession = { agent: {} };
    applySystemPromptOverrideToSession(session, "You are a helpful assistant with custom context.");

    const projected = await project(session, createTranscript());

    expect(projected.filter((message) => message.role === "system")).toHaveLength(1);
    expect(projected[0]).toEqual({
      role: "system",
      content: "You are a helpful assistant with custom context.",
      toolsAdded: [readTool, execTool],
      timestamp: 0,
    });
    expect(getCurrentSystemPrompt(projected)).toBe(
      "You are a helpful assistant with custom context.",
    );
    expect(getCurrentTools(projected).map((tool) => tool.name)).toEqual(["read", "exec"]);
    expect(projected.slice(1).map((message) => message.role)).toEqual(["user", "user"]);
  });

  it("trims whitespace from string overrides", async () => {
    const session: MockSession = { agent: {} };
    applySystemPromptOverrideToSession(session, "  padded prompt  ");

    expect(getCurrentSystemPrompt(await project(session, createTranscript()))).toBe(
      "padded prompt",
    );
  });

  it("applies a function override", async () => {
    const session: MockSession = { agent: {} };
    applySystemPromptOverrideToSession(
      session,
      createSystemPromptOverride("function-based prompt"),
    );

    expect(getCurrentSystemPrompt(await project(session, createTranscript()))).toBe(
      "function-based prompt",
    );
  });

  it("swaps the prompt on re-apply without stacking wrappers and runs after earlier transforms", async () => {
    const calls: string[] = [];
    const session: MockSession = {
      agent: {
        transformContext: async (messages) => {
          calls.push("previous");
          return messages;
        },
      },
    };
    applySystemPromptOverrideToSession(session, "first");
    const installed = session.agent.transformContext;
    applySystemPromptOverrideToSession(session, "second");

    expect(session.agent.transformContext).toBe(installed);
    const projected = await project(session, createTranscript());
    expect(calls).toEqual(["previous"]);
    expect(getCurrentSystemPrompt(projected)).toBe("second");
  });

  it("produces byte-identical request transcripts across turns (prompt-cache stability)", async () => {
    const session: MockSession = { agent: {} };
    applySystemPromptOverrideToSession(session, "stable prompt");
    const first = JSON.stringify(await project(session, createTranscript()));
    const second = JSON.stringify(await project(session, createTranscript()));
    expect(second).toBe(first);
  });

  it("drops the system message entirely for an empty prompt without tools", () => {
    const projected = projectSystemPromptOntoMessages(
      [
        { role: "system", content: "pi prompt", timestamp: 1 },
        { role: "user", content: "hi", timestamp: 2 },
      ],
      "",
    );
    expect(projected).toEqual([{ role: "user", content: "hi", timestamp: 2 }]);
  });
});

describe("buildEmbeddedSystemPrompt", () => {
  afterEach(() => {
    clearMemoryPluginState();
  });

  it("forwards provider prompt contributions into the embedded prompt", () => {
    const prompt = buildEmbeddedSystemPrompt({
      workspaceDir: "/tmp/enclawed",
      reasoningTagHint: false,
      runtimeInfo: {
        host: "local",
        os: "darwin",
        arch: "arm64",
        node: process.version,
        model: "gpt-5.4",
        provider: "openai",
      },
      tools: [],
      modelAliasLines: [],
      userTimezone: "UTC",
      promptContribution: {
        stablePrefix: "## Embedded Stable\n\nStable provider guidance.",
      },
    });

    expect(prompt).toContain("## Embedded Stable\n\nStable provider guidance.");
  });

  it("can omit base memory guidance for non-legacy context engines", () => {
    registerMemoryPromptSection(() => ["## Memory Recall", "Use memory carefully.", ""]);

    const prompt = buildEmbeddedSystemPrompt({
      workspaceDir: "/tmp/enclawed",
      reasoningTagHint: false,
      runtimeInfo: {
        host: "local",
        os: "darwin",
        arch: "arm64",
        node: process.version,
        model: "gpt-5.4",
        provider: "openai",
      },
      tools: [],
      modelAliasLines: [],
      userTimezone: "UTC",
      includeMemorySection: false,
    });

    expect(prompt).not.toContain("## Memory Recall");
  });
});
