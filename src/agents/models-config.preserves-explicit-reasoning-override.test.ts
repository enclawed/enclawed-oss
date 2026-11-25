import { describe, expect, it } from "vitest";
import { mergeProviderModels, mergeProviders } from "./models-config.merge.js";
import type { ProviderConfig } from "./models-config.providers.secrets.js";

const MODEL_ID = "llama-3.3-70b";

function createVllmProvider(model: NonNullable<ProviderConfig["models"]>[number]) {
  return {
    baseUrl: "http://127.0.0.1:8000/v1",
    api: "openai-completions",
    models: [model],
  } satisfies ProviderConfig;
}

function createModel(
  overrides: Partial<NonNullable<ProviderConfig["models"]>[number]> = {},
): NonNullable<ProviderConfig["models"]>[number] {
  return {
    id: MODEL_ID,
    name: "Llama 3.3 70B",
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 8192,
    ...overrides,
  } as NonNullable<ProviderConfig["models"]>[number];
}

function createModelWithoutReasoning(): NonNullable<ProviderConfig["models"]>[number] {
  return {
    id: MODEL_ID,
    name: "Llama 3.3 70B",
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 8192,
  } as NonNullable<ProviderConfig["models"]>[number];
}

function mergedModel(
  explicitModel: NonNullable<ProviderConfig["models"]>[number],
): NonNullable<ProviderConfig["models"]>[number] | undefined {
  return mergeProviderModels(
    createVllmProvider(createModel({ reasoning: true })),
    createVllmProvider(explicitModel),
  ).models?.find((model) => model.id === MODEL_ID);
}

describe("models-config: explicit reasoning override", () => {
  it("preserves user reasoning:false when the built-in catalog has reasoning:true", () => {
    const merged = mergedModel(createModel({ reasoning: false }));

    expect(merged).toBeDefined();
    expect(merged?.reasoning).toBe(false);
  });

  it("keeps reasoning unset when user omits the field", () => {
    const merged = mergeProviders({
      implicit: {},
      explicit: {
        vllm: createVllmProvider(createModelWithoutReasoning()),
      },
    }).vllm?.models?.find((model) => model.id === MODEL_ID);

    expect(merged).toBeDefined();
    expect(merged?.reasoning).toBeUndefined();
  });
});
