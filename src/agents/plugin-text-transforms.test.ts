import type { StreamFn } from "@mariozechner/pi-agent-core";
import {
  createAssistantMessageEventStream,
  getCurrentSystemPrompt,
  normalizeContext,
  type AssistantMessage,
  type Model,
  type TranscriptContext,
} from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import {
  applyPluginTextReplacements,
  mergePluginTextTransforms,
  transformStreamContextText,
  wrapStreamFnTextTransforms,
} from "./plugin-text-transforms.js";

const model = {
  api: "openai-responses",
  provider: "test",
  id: "test-model",
} as Model<"openai-responses">;

function makeAssistantMessage(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    stopReason: "stop",
    api: "openai-responses",
    provider: "test",
    model: "test-model",
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    timestamp: 0,
  };
}

describe("plugin text transforms", () => {
  it("merges registered transform groups in order", () => {
    const merged = mergePluginTextTransforms(
      { input: [{ from: /red basket/g, to: "blue basket" }] },
      { output: [{ from: /blue basket/g, to: "red basket" }] },
      { input: [{ from: /paper ticket/g, to: "digital ticket" }] },
    );

    expect(merged?.input).toHaveLength(2);
    expect(merged?.output).toHaveLength(1);
    expect(applyPluginTextReplacements("red basket paper ticket", merged?.input)).toBe(
      "blue basket digital ticket",
    );
  });

  it("applies ordered string and regexp replacements", () => {
    expect(
      applyPluginTextReplacements("paper ticket on the left shelf", [
        { from: /paper ticket/g, to: "digital ticket" },
        { from: /left shelf/g, to: "right shelf" },
        { from: "digital ticket", to: "counter receipt" },
      ]),
    ).toBe("counter receipt on the right shelf");
  });

  it("rewrites system prompt and message text content before transport", () => {
    const context = transformStreamContextText(
      normalizeContext({
        systemPrompt: "Use orchid mailbox inside north tower",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Please use the red basket" },
              { type: "image", data: "abc", mimeType: "image/png" },
            ],
            timestamp: 0,
          },
        ],
      }),
      [
        {
          from: /orchid mailbox/g,
          to: "pine mailbox",
        },
        { from: /red basket/g, to: "blue basket" },
      ],
    );

    expect(getCurrentSystemPrompt(context.messages)).toBe("Use pine mailbox inside north tower");
    const userMessage = context.messages.find((message) => message.role === "user");
    expect(userMessage?.content).toMatchObject([
      { type: "text", text: "Please use the blue basket" },
      { type: "image", data: "abc", mimeType: "image/png" },
    ]);
  });

  it("wraps stream functions with inbound and outbound replacements", async () => {
    let capturedContext: TranscriptContext | undefined;
    const baseStreamFn: StreamFn = (_model, context) => {
      capturedContext = context;
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        const partial = makeAssistantMessage("blue basket on the right shelf");
        stream.push({
          type: "text_delta",
          contentIndex: 0,
          delta: "blue basket on the right shelf",
          partial,
        });
        stream.push({
          type: "done",
          reason: "stop",
          message: makeAssistantMessage("final blue basket on the right shelf"),
        });
        stream.end();
      });
      return stream;
    };

    const wrapped = wrapStreamFnTextTransforms({
      streamFn: baseStreamFn,
      input: [{ from: /red basket/g, to: "blue basket" }],
      output: [
        { from: /blue basket/g, to: "red basket" },
        { from: /right shelf/g, to: "left shelf" },
      ],
      transformSystemPrompt: false,
    });
    const stream = await Promise.resolve(
      wrapped(
        model,
        normalizeContext({
          systemPrompt: "Keep red basket untouched here",
          messages: [{ role: "user", content: "Use red basket", timestamp: 0 }],
        }),
        undefined,
      ),
    );
    const events = [];
    for await (const event of stream) {
      events.push(event);
    }
    const result = await stream.result();

    // transformSystemPrompt: false leaves the prompt's system message untouched.
    expect(getCurrentSystemPrompt(capturedContext?.messages ?? [])).toBe(
      "Keep red basket untouched here",
    );
    expect(capturedContext?.messages).toMatchObject([
      { role: "system", content: "Keep red basket untouched here" },
      { role: "user", content: "Use blue basket" },
    ]);
    expect(events[0]).toMatchObject({
      type: "text_delta",
      delta: "red basket on the left shelf",
    });
    expect(result.content).toMatchObject([
      { type: "text", text: "final red basket on the left shelf" },
    ]);
  });
});
