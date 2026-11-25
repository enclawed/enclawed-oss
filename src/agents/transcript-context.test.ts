import { normalizeContext, type Message, type Tool } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import {
  getTranscriptSystemPrompt,
  getTranscriptTools,
  mapTranscriptSystemPromptText,
  replaceTranscriptSystemPrompt,
  toRequestContext,
} from "./transcript-context.js";

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

const user = (text: string, timestamp: number): Message => ({
  role: "user",
  content: [{ type: "text", text }],
  timestamp,
});

// What pi-agent-core hands a stream function after a tool-set change and a
// later instruction patch: a leading system message plus mid-transcript ones.
function transcriptWithMidConversationSystemMessages() {
  return normalizeContext({
    systemPrompt: "BASE PROMPT",
    tools: [readTool],
    messages: [
      user("first", 1),
      { role: "system", content: "", toolsAdded: [execTool], timestamp: 2 },
      { role: "system", content: "LATER INSTRUCTION", timestamp: 3 },
      user("second", 4),
    ],
  });
}

describe("toRequestContext", () => {
  it("reproduces the pre-transcript request shape exactly for a plain prompt + tools", () => {
    const transcript = normalizeContext({
      systemPrompt: "BASE PROMPT",
      tools: [readTool],
      messages: [user("hi", 1)],
    });
    expect(toRequestContext(transcript)).toEqual({
      systemPrompt: "BASE PROMPT",
      messages: [user("hi", 1)],
      tools: [readTool],
    });
  });

  it("replays mid-conversation system messages into the prompt and tool list and drops them from messages", () => {
    const request = toRequestContext(transcriptWithMidConversationSystemMessages());
    expect(request.systemPrompt).toBe("BASE PROMPT\n\nLATER INSTRUCTION");
    expect(request.tools?.map((tool) => tool.name)).toEqual(["read", "exec"]);
    expect(request.messages).toEqual([user("first", 1), user("second", 4)]);
  });

  it("omits systemPrompt/tools when the transcript declares none", () => {
    const request = toRequestContext(normalizeContext({ messages: [user("hi", 1)] }));
    expect(request).toEqual({ messages: [user("hi", 1)] });
    expect("systemPrompt" in request).toBe(false);
    expect("tools" in request).toBe(false);
  });

  it("is deterministic across calls (prompt-cache stability)", () => {
    const first = JSON.stringify(toRequestContext(transcriptWithMidConversationSystemMessages()));
    const second = JSON.stringify(toRequestContext(transcriptWithMidConversationSystemMessages()));
    expect(second).toBe(first);
  });
});

describe("mapTranscriptSystemPromptText", () => {
  it("rewrites prompt text in every system message (content and sections) but not tools or conversation", () => {
    const transcript = normalizeContext({
      messages: [
        {
          role: "system",
          content: "A <marker> B",
          sections: { extra: "C <marker>", removed: null },
          toolsAdded: [readTool],
          timestamp: 1,
        },
        user("keep <marker>", 2),
        { role: "system", content: [{ type: "text", text: "D <marker>" }], timestamp: 3 },
      ],
    });
    const mapped = mapTranscriptSystemPromptText(transcript, (text) =>
      text.replaceAll("<marker>", "x"),
    );
    expect(mapped.messages).toEqual([
      {
        role: "system",
        content: "A x B",
        sections: { extra: "C x", removed: null },
        toolsAdded: [readTool],
        timestamp: 1,
      },
      user("keep <marker>", 2),
      { role: "system", content: [{ type: "text", text: "D x" }], timestamp: 3 },
    ]);
  });

  it("returns the same context when there is no system message", () => {
    const transcript = normalizeContext({ messages: [user("hi", 1)] });
    expect(mapTranscriptSystemPromptText(transcript, () => "changed")).toBe(transcript);
  });
});

describe("replaceTranscriptSystemPrompt", () => {
  it("drops the prompt text but keeps the current tools when given no prompt", () => {
    const replaced = replaceTranscriptSystemPrompt(
      transcriptWithMidConversationSystemMessages(),
      undefined,
    );
    expect(getTranscriptSystemPrompt(replaced)).toBeUndefined();
    expect(getTranscriptTools(replaced)?.map((tool) => tool.name)).toEqual(["read", "exec"]);
    expect(replaced.messages.filter((message) => message.role === "system")).toHaveLength(1);
  });

  it("installs an exact replacement prompt", () => {
    const replaced = replaceTranscriptSystemPrompt(
      transcriptWithMidConversationSystemMessages(),
      "EXACT",
    );
    expect(getTranscriptSystemPrompt(replaced)).toBe("EXACT");
  });
});
