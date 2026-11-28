import {
  registerProviderPlugin,
  registerSingleProviderPlugin,
} from "@enclawed/plugin-sdk/plugin-test-runtime";
import { expectPassthroughReplayPolicy } from "@enclawed/plugin-sdk/provider-test-contracts";
import { getModels } from "@mariozechner/pi-ai/compat";
import { describe, expect, it } from "vitest";
import plugin from "./index.js";

describe("opencode-go provider plugin", () => {
  it("registers image media understanding through the OpenCode Go plugin", async () => {
    const { mediaProviders } = await registerProviderPlugin({
      plugin,
      id: "opencode-go",
      name: "OpenCode Go Provider",
    });

    expect(mediaProviders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "opencode-go",
          capabilities: ["image"],
          defaultModels: { image: "kimi-k2.6" },
          describeImage: expect.any(Function),
          describeImages: expect.any(Function),
        }),
      ]),
    );
  });

  it("owns passthrough-gemini replay policy for Gemini-backed models", async () => {
    await expectPassthroughReplayPolicy({
      plugin,
      providerId: "opencode-go",
      modelId: "gemini-2.5-pro",
      sanitizeThoughtSignatures: true,
    });
  });

  it("keeps non-Gemini replay policy minimal on passthrough routes", async () => {
    await expectPassthroughReplayPolicy({
      plugin,
      providerId: "opencode-go",
      modelId: "qwen3-coder",
    });
  });

  it("keeps OpenCode Go catalog coverage aligned with upstream", async () => {
    const provider = await registerSingleProviderPlugin(plugin);
    expect(provider.catalog).toBeUndefined();

    const models = new Map(getModels("opencode-go").map((model) => [model.id, model]));
    // Pinned to what this build's pi-ai actually registers. These ids come from
    // pi-ai's bundled catalog rather than this plugin's manifest, so the list
    // moves with the resolved pi-ai version -- glm-5 is no longer in it.
    expect([...models.keys()]).toEqual([
      "claude-haiku-5-5",
      "minimax-m3",
      "qwen3.7-plus",
      "qwen3.8-flash",
      "qwen3.8-max",
      "qwen4-max",
      "gemini-4-argon",
      "beam-free",
      "deepseek-v4-pro",
      "deepseek-v4.1-flash",
      "glm-5.3",
      "glm-5.3-flash",
      "hy3",
      "hy4",
      "hy4-flash-free",
      "hy4-preview",
      "iceman-contributor-free",
      "kimi-k2.7-code",
      "kimi-k3",
      "kimi-k3.1-pro",
      "longcat-2.0",
      "longcat-2.5-free",
      "mimo-v2.5",
      "mimo-v2.5-pro",
      "mimo-v2.6-flash",
      "mimo-v2.6-pro",
      "minimax-m3.1-flash",
      "step-5-preview",
      "gpt-5.6-luna",
      "gpt-6-luna",
      "grok-4.7",
      "muse-spark-1.2-contributor",
      "muse-spark-1.3-contributor",
    ]);
    const supplemental = await provider.augmentModelCatalog?.({
      entries: [...models.values()].map((model) => ({
        provider: model.provider,
        id: model.id,
        name: model.name,
      })),
    } as never);
    expect(supplemental).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "opencode-go",
          id: "deepseek-v4-pro",
          name: "DeepSeek V4 Pro",
        }),
        expect.objectContaining({
          provider: "opencode-go",
          id: "deepseek-v4-flash",
          name: "DeepSeek V4 Flash",
        }),
      ]),
    );

    // pi-ai 1.x serves OpenCode Go from protocol-specific endpoints.
    expect(models.get("kimi-k3")).toMatchObject({
      api: "openai-completions",
      baseUrl: "https://opencode.ai/inference/go/openai/v1",
      input: ["text", "image"],
      reasoning: true,
      contextWindow: 1_048_576,
      maxTokens: 1_048_576,
    });
    expect(models.get("minimax-m3")).toMatchObject({
      api: "anthropic-messages",
      baseUrl: "https://opencode.ai/inference/go/anthropic",
      reasoning: true,
      contextWindow: 1_000_000,
      maxTokens: 131_072,
    });
    expect(models.get("mimo-v2.5-pro")).toMatchObject({
      api: "openai-completions",
      baseUrl: "https://opencode.ai/inference/go/openai/v1",
      input: ["text"],
      reasoning: true,
      contextWindow: 1_048_576,
      maxTokens: 128_000,
    });
    expect(models.get("mimo-v2.5")).toMatchObject({
      input: ["text", "image"],
      reasoning: true,
      contextWindow: 1_000_000,
      maxTokens: 128_000,
    });
    expect(
      provider.resolveDynamicModel?.({
        modelId: "deepseek-v4-pro",
      } as never),
    ).toMatchObject({
      id: "deepseek-v4-pro",
      api: "openai-completions",
      provider: "opencode-go",
      baseUrl: "https://opencode.ai/zen/go/v1",
      reasoning: true,
      contextWindow: 1_000_000,
      maxTokens: 384_000,
      compat: {
        supportsUsageInStreaming: true,
        supportsReasoningEffort: true,
        maxTokensField: "max_tokens",
      },
    });
  });

  it("disables invalid DeepSeek V4 reasoning_effort off payloads on OpenCode Go", async () => {
    const provider = await registerSingleProviderPlugin(plugin);
    const capturedPayloads: Record<string, unknown>[] = [];
    const baseStreamFn = (_model: unknown, _context: unknown, options: unknown) => {
      const payload = {
        model: "deepseek-v4-flash",
        reasoning_effort: "off",
        reasoning: "off",
      };
      (options as { onPayload?: (payload: Record<string, unknown>) => void })?.onPayload?.(payload);
      capturedPayloads.push(payload);
      return {} as never;
    };

    const streamFn = provider.wrapStreamFn?.({
      streamFn: baseStreamFn as never,
      providerId: "opencode-go",
      modelId: "deepseek-v4-flash",
      thinkingLevel: "off",
    } as never);

    expect(streamFn).toBeTypeOf("function");
    await streamFn?.(
      { provider: "opencode-go", id: "deepseek-v4-flash" } as never,
      {} as never,
      {},
    );

    expect(capturedPayloads).toEqual([
      {
        model: "deepseek-v4-flash",
        thinking: { type: "disabled" },
      },
    ]);
  });

  it("canonicalizes stale OpenCode Go base URLs", async () => {
    const provider = await registerSingleProviderPlugin(plugin);

    expect(
      provider.normalizeConfig?.({
        provider: "opencode-go",
        providerConfig: {
          api: "openai-completions",
          baseUrl: "https://opencode.ai/go/v1/",
          models: [],
        },
      } as never),
    ).toMatchObject({
      baseUrl: "https://opencode.ai/zen/go/v1",
    });

    expect(
      provider.normalizeResolvedModel?.({
        provider: "opencode-go",
        model: {
          provider: "opencode-go",
          id: "kimi-k2.5",
          name: "Kimi K2.5",
          api: "openai-completions",
          baseUrl: "https://opencode.ai/go/v1",
          reasoning: true,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 262_144,
          maxTokens: 65_536,
        },
      } as never),
    ).toMatchObject({
      baseUrl: "https://opencode.ai/zen/go/v1",
    });

    expect(
      provider.normalizeTransport?.({
        provider: "opencode-go",
        api: "openai-completions",
        baseUrl: "https://opencode.ai/go/v1",
      } as never),
    ).toEqual({
      api: "openai-completions",
      baseUrl: "https://opencode.ai/zen/go/v1",
    });

    expect(
      provider.normalizeTransport?.({
        provider: "opencode-go",
        api: "anthropic-messages",
        baseUrl: "https://opencode.ai/go",
      } as never),
    ).toEqual({
      api: "anthropic-messages",
      baseUrl: "https://opencode.ai/zen/go",
    });
  });
});
