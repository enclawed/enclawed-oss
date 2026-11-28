import { describe, expect, it } from "vitest";
import {
  applyProviderNativeStreamingUsageCompat,
  supportsNativeStreamingUsageCompat,
} from "./provider-catalog-shared.js";
import type { ModelDefinitionConfig } from "./provider-model-shared.js";

function buildModel(id: string, supportsUsageInStreaming?: boolean): ModelDefinitionConfig {
  return {
    id,
    name: id,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1024,
    maxTokens: 1024,
    ...(supportsUsageInStreaming === undefined ? {} : { compat: { supportsUsageInStreaming } }),
  };
}

describe("provider-catalog-shared native streaming usage compat", () => {
  it("reports no native streaming usage compat for generic endpoints", () => {
    expect(
      supportsNativeStreamingUsageCompat({
        providerId: "custom-proxy",
        baseUrl: "https://proxy.example.com/v1",
      }),
    ).toBe(false);
    expect(
      supportsNativeStreamingUsageCompat({
        providerId: "custom-local",
        baseUrl: "http://127.0.0.1:8000/v1",
      }),
    ).toBe(false);
  });

  it("leaves provider configs unchanged when the endpoint has no native compat", () => {
    const providerConfig = {
      api: "openai-completions" as const,
      baseUrl: "https://proxy.example.com/v1",
      models: [buildModel("model-a"), buildModel("model-b", false)],
    };
    const provider = applyProviderNativeStreamingUsageCompat({
      providerId: "custom-proxy",
      providerConfig,
    });

    expect(provider).toBe(providerConfig);
    expect(provider.models?.[0]?.compat?.supportsUsageInStreaming).toBeUndefined();
    expect(provider.models?.[1]?.compat?.supportsUsageInStreaming).toBe(false);
  });
});
