import type { StreamFn } from "@mariozechner/pi-agent-core";
import { normalizeContext, type Model } from "@mariozechner/pi-ai";
import { applyExtraParamsToAgent } from "./pi-embedded-runner/extra-params.js";

export function runExtraParamsPayloadCase(params: {
  provider: string;
  modelId: string;
  thinkingLevel?: "off" | "low" | "medium" | "high";
  payload?: Record<string, unknown>;
  cfg?: Record<string, unknown>;
}) {
  const payloads: Record<string, unknown>[] = [];
  const baseStreamFn: StreamFn = (model, _context, options) => {
    const payload = { ...params.payload };
    options?.onPayload?.(payload, model);
    payloads.push(payload);
    return {} as ReturnType<StreamFn>;
  };
  const agent = { streamFunction: baseStreamFn };

  applyExtraParamsToAgent(
    agent,
    params.cfg as Parameters<typeof applyExtraParamsToAgent>[1],
    params.provider,
    params.modelId,
    undefined,
    params.thinkingLevel,
  );

  const model = {
    api: "openai-completions",
    provider: params.provider,
    id: params.modelId,
  } as Model<"openai-completions">;
  const context = normalizeContext({ messages: [] });
  void agent.streamFunction(model, context, {});

  return payloads[0] ?? {};
}
