import { describe, expect, it } from "vitest";
import {
  listProviderAttributionPolicies,
  resolveProviderAttributionHeaders,
  resolveProviderAttributionIdentity,
  resolveProviderAttributionPolicy,
  resolveProviderEndpoint,
  resolveProviderRequestAttributionHeaders,
  resolveProviderRequestCapabilities,
  resolveProviderRequestPolicy,
  describeProviderRequestRoutingSummary,
} from "./provider-attribution.js";

describe("provider attribution", () => {
  it("resolves the canonical Enclawed product and runtime version", () => {
    const identity = resolveProviderAttributionIdentity({
      ENCLAWED_VERSION: "2026.3.99",
    });

    expect(identity).toEqual({
      product: "Enclawed",
      version: "2026.3.99",
    });
  });

  it("keeps the OpenRouter policy documented but sends no app attribution", () => {
    const policy = resolveProviderAttributionPolicy("openrouter", {
      ENCLAWED_VERSION: "2026.3.22",
    });

    expect(policy).toEqual({
      provider: "openrouter",
      enabledByDefault: false,
      verification: "vendor-documented",
      hook: "request-headers",
      docsUrl: "https://openrouter.ai/docs/app-attribution",
      reviewNote: "Optional app attribution headers; intentionally not sent.",
      product: "Enclawed",
      version: "2026.3.22",
    });
    expect(
      resolveProviderAttributionHeaders("OpenRouter", {
        ENCLAWED_VERSION: "2026.3.22",
      }),
    ).toBeUndefined();
  });

  it("sends no OpenAI originator, version or User-Agent attribution", () => {
    expect(resolveProviderAttributionPolicy("openai", { ENCLAWED_VERSION: "2026.3.22" })).toEqual({
      provider: "openai",
      enabledByDefault: false,
      verification: "vendor-hidden-api-spec",
      hook: "request-headers",
      reviewNote: "Optional originator/User-Agent attribution; intentionally not sent.",
      product: "Enclawed",
      version: "2026.3.22",
    });
    expect(
      resolveProviderAttributionHeaders("openai", { ENCLAWED_VERSION: "2026.3.22" }),
    ).toBeUndefined();
  });

  it("sends only the neutral originator ChatGPT-backed Codex requires", () => {
    expect(
      resolveProviderAttributionPolicy("openai-codex", { ENCLAWED_VERSION: "2026.3.22" }),
    ).toEqual({
      provider: "openai-codex",
      enabledByDefault: true,
      verification: "vendor-hidden-api-spec",
      hook: "request-headers",
      reviewNote:
        "ChatGPT-backed Codex requires an originator header; Enclawed sends pi-ai's neutral value and no product name, version or User-Agent.",
      product: "Enclawed",
      version: "2026.3.22",
      headers: {
        originator: "pi",
      },
    });
    expect(
      resolveProviderAttributionHeaders("openai-codex", { ENCLAWED_VERSION: "2026.3.22" }),
    ).toEqual({ originator: "pi" });
  });

  it("never resolves request headers that name Enclawed or its version", () => {
    const env = { ENCLAWED_VERSION: "2026.3.22" };
    const routes = [
      {
        provider: "openrouter",
        api: "openai-completions",
        baseUrl: "https://openrouter.ai/api/v1",
      },
      { provider: "openrouter", api: "openai-responses" },
      { provider: "openai", api: "openai-responses", baseUrl: "https://api.openai.com/v1" },
      { provider: "openai", api: "openai-completions", baseUrl: "https://api.openai.com/v1" },
      {
        provider: "openai-codex",
        api: "openai-codex-responses",
        baseUrl: "https://chatgpt.com/backend-api",
      },
      { provider: "anthropic", api: "anthropic-messages", baseUrl: "https://api.anthropic.com" },
    ];
    for (const route of routes) {
      const headers =
        resolveProviderRequestAttributionHeaders(
          { ...route, transport: "stream", capability: "llm" },
          env,
        ) ?? {};
      for (const [name, value] of Object.entries(headers)) {
        expect(`${name}: ${value}`.toLowerCase()).not.toContain("enclawed");
        expect(value).not.toContain("2026.3.22");
        expect(name.toLowerCase()).not.toMatch(/^(http-referer|x-title|x-openrouter-|user-agent)/);
      }
    }
  });

  it("lists the current attribution support matrix", () => {
    expect(
      listProviderAttributionPolicies({ ENCLAWED_VERSION: "2026.3.22" }).map((policy) => [
        policy.provider,
        policy.enabledByDefault,
        policy.verification,
        policy.hook,
      ]),
    ).toEqual([
      ["openrouter", false, "vendor-documented", "request-headers"],
      ["openai", false, "vendor-hidden-api-spec", "request-headers"],
      ["openai-codex", true, "vendor-hidden-api-spec", "request-headers"],
      ["anthropic", false, "vendor-sdk-hook-only", "default-headers"],
      ["google", false, "vendor-sdk-hook-only", "user-agent-extra"],
      ["groq", false, "vendor-sdk-hook-only", "default-headers"],
      ["mistral", false, "vendor-sdk-hook-only", "custom-user-agent"],
      ["together", false, "vendor-sdk-hook-only", "default-headers"],
    ]);
  });

  it("applies no OpenAI attribution on native or proxy hosts", () => {
    expect(
      resolveProviderRequestPolicy(
        {
          provider: "openai",
          api: "openai-responses",
          baseUrl: "https://api.openai.com/v1",
          transport: "stream",
          capability: "llm",
        },
        { ENCLAWED_VERSION: "2026.3.22" },
      ),
    ).toMatchObject({
      endpointClass: "openai-public",
      attributionProvider: undefined,
      attributionHeaders: undefined,
      allowsHiddenAttribution: false,
      usesKnownNativeOpenAIEndpoint: true,
      usesVerifiedOpenAIAttributionHost: true,
      usesExplicitProxyLikeEndpoint: false,
    });

    expect(
      resolveProviderRequestPolicy(
        {
          provider: "openai",
          api: "openai-responses",
          baseUrl: "https://proxy.example.com/v1",
          transport: "stream",
          capability: "llm",
        },
        { ENCLAWED_VERSION: "2026.3.22" },
      ),
    ).toMatchObject({
      endpointClass: "custom",
      attributionProvider: undefined,
      allowsHiddenAttribution: false,
      usesKnownNativeOpenAIEndpoint: false,
      usesVerifiedOpenAIAttributionHost: false,
      usesExplicitProxyLikeEndpoint: true,
    });
  });

  it("classifies OpenAI-family default, codex, and Azure routes distinctly", () => {
    expect(
      resolveProviderRequestPolicy({
        provider: "openai",
        api: "openai-responses",
        transport: "stream",
        capability: "llm",
      }),
    ).toMatchObject({
      endpointClass: "default",
      attributionProvider: undefined,
      usesKnownNativeOpenAIRoute: true,
      usesExplicitProxyLikeEndpoint: false,
    });

    expect(
      resolveProviderRequestPolicy({
        provider: "openai-codex",
        api: "openai-responses",
        baseUrl: "https://chatgpt.com/backend-api",
        transport: "stream",
        capability: "llm",
      }),
    ).toMatchObject({
      endpointClass: "openai-codex",
      attributionProvider: "openai-codex",
      attributionHeaders: { originator: "pi" },
      allowsHiddenAttribution: true,
    });

    expect(
      resolveProviderRequestPolicy({
        provider: "azure-openai",
        api: "azure-openai-responses",
        baseUrl: "https://tenant.openai.azure.com/openai/v1",
        transport: "stream",
        capability: "llm",
      }),
    ).toMatchObject({
      endpointClass: "azure-openai",
      attributionProvider: undefined,
      allowsHiddenAttribution: false,
      usesKnownNativeOpenAIEndpoint: true,
    });
  });

  it("classifies native Mistral hosts centrally", () => {
    expect(resolveProviderEndpoint("https://api.mistral.ai/v1")).toMatchObject({
      endpointClass: "mistral-public",
      hostname: "api.mistral.ai",
    });

    expect(
      resolveProviderRequestCapabilities({
        provider: "mistral",
        api: "openai-completions",
        baseUrl: "https://api.mistral.ai/v1",
        capability: "llm",
        transport: "stream",
      }),
    ).toMatchObject({
      endpointClass: "mistral-public",
      isKnownNativeEndpoint: true,
      knownProviderFamily: "mistral",
    });
  });

  it("classifies native OpenAI-compatible vendor hosts centrally", () => {
    expect(resolveProviderEndpoint("https://api.x.ai/v1")).toMatchObject({
      endpointClass: "xai-native",
      hostname: "api.x.ai",
    });
    expect(resolveProviderEndpoint("https://api.grok.x.ai/v1")).toMatchObject({
      endpointClass: "xai-native",
      hostname: "api.grok.x.ai",
    });
    expect(resolveProviderEndpoint("https://llm.chutes.ai/v1")).toMatchObject({
      endpointClass: "chutes-native",
      hostname: "llm.chutes.ai",
    });
    expect(resolveProviderEndpoint("https://api.groq.com/openai/v1")).toMatchObject({
      endpointClass: "groq-native",
      hostname: "api.groq.com",
    });
    expect(resolveProviderEndpoint("https://api.cerebras.ai/v1")).toMatchObject({
      endpointClass: "cerebras-native",
      hostname: "api.cerebras.ai",
    });
    expect(resolveProviderEndpoint("https://opencode.ai/api")).toMatchObject({
      endpointClass: "opencode-native",
      hostname: "opencode.ai",
    });
  });

  it("treats OpenRouter-hosted Responses routes as explicit proxy-like endpoints", () => {
    expect(
      resolveProviderRequestPolicy({
        provider: "openrouter",
        api: "openai-responses",
        baseUrl: "https://openrouter.ai/api/v1",
        transport: "stream",
        capability: "llm",
      }),
    ).toMatchObject({
      endpointClass: "openrouter",
      usesExplicitProxyLikeEndpoint: true,
      attributionProvider: undefined,
    });
  });

  it("sends no OpenRouter attribution on OpenRouter or proxy endpoints", () => {
    expect(
      resolveProviderRequestPolicy({
        provider: "openrouter",
        api: "openai-responses",
        baseUrl: "https://openrouter.ai/api/v1",
        transport: "stream",
        capability: "llm",
      }),
    ).toMatchObject({
      endpointClass: "openrouter",
      attributionProvider: undefined,
      attributionHeaders: undefined,
      allowsHiddenAttribution: false,
    });

    expect(
      resolveProviderRequestAttributionHeaders({
        provider: "openrouter",
        baseUrl: "https://proxy.example.com/v1",
        transport: "stream",
        capability: "llm",
      }),
    ).toBeUndefined();
  });

  it("summarizes proxy-like, local, invalid, default, and native routing compactly", () => {
    expect(
      describeProviderRequestRoutingSummary({
        provider: "openai",
        api: "openai-responses",
      }),
    ).toBe("provider=openai api=openai-responses endpoint=default route=default policy=none");

    expect(
      describeProviderRequestRoutingSummary({
        provider: "openai",
        api: "openai-responses",
        baseUrl: "javascript:alert(1)",
      }),
    ).toBe("provider=openai api=openai-responses endpoint=invalid route=invalid policy=none");

    expect(
      describeProviderRequestRoutingSummary({
        provider: "openai",
        api: "openai-responses",
        baseUrl: "https://proxy.example.com/v1",
        transport: "stream",
        capability: "llm",
      }),
    ).toBe("provider=openai api=openai-responses endpoint=custom route=proxy-like policy=none");

    expect(
      describeProviderRequestRoutingSummary({
        provider: "vllm",
        api: "openai-responses",
        baseUrl: "http://localhost:1234/v1",
        transport: "stream",
        capability: "llm",
      }),
    ).toBe("provider=vllm api=openai-responses endpoint=local route=local policy=none");

    expect(
      describeProviderRequestRoutingSummary({
        provider: "openai",
        api: "openai-responses",
        baseUrl: "https://api.openai.com/v1",
        transport: "stream",
        capability: "llm",
      }),
    ).toBe("provider=openai api=openai-responses endpoint=openai-public route=native policy=none");

    expect(
      describeProviderRequestRoutingSummary({
        provider: "openrouter",
        api: "openai-responses",
        baseUrl: "https://openrouter.ai/api/v1",
        transport: "stream",
        capability: "llm",
      }),
    ).toBe(
      "provider=openrouter api=openai-responses endpoint=openrouter route=proxy-like policy=none",
    );

    expect(
      describeProviderRequestRoutingSummary({
        provider: "groq",
        api: "openai-completions",
        baseUrl: "https://api.groq.com/openai/v1",
        transport: "stream",
        capability: "llm",
      }),
    ).toBe("provider=groq api=openai-completions endpoint=groq-native route=native policy=none");
  });

  it("models other provider families without enabling hidden attribution", () => {
    expect(
      resolveProviderRequestPolicy({
        provider: "google",
        baseUrl: "https://generativelanguage.googleapis.com",
        transport: "http",
        capability: "image",
      }),
    ).toMatchObject({
      knownProviderFamily: "google",
      attributionProvider: undefined,
      allowsHiddenAttribution: false,
    });

    expect(
      resolveProviderRequestPolicy({
        provider: "github-copilot",
        transport: "http",
        capability: "llm",
      }),
    ).toMatchObject({
      knownProviderFamily: "github-copilot",
      attributionProvider: undefined,
      allowsHiddenAttribution: false,
    });
  });

  it("classifies native Anthropic endpoints separately from custom hosts", () => {
    expect(resolveProviderEndpoint("https://api.anthropic.com/v1")).toMatchObject({
      endpointClass: "anthropic-public",
      hostname: "api.anthropic.com",
    });

    expect(resolveProviderEndpoint("https://proxy.example.com/anthropic")).toMatchObject({
      endpointClass: "custom",
      hostname: "proxy.example.com",
    });
  });

  it("classifies Google Gemini and Vertex endpoints separately from custom hosts", () => {
    expect(resolveProviderEndpoint("https://generativelanguage.googleapis.com")).toMatchObject({
      endpointClass: "google-generative-ai",
      hostname: "generativelanguage.googleapis.com",
    });

    expect(
      resolveProviderEndpoint("https://europe-west4-aiplatform.googleapis.com/v1/projects/test"),
    ).toMatchObject({
      endpointClass: "google-vertex",
      hostname: "europe-west4-aiplatform.googleapis.com",
      googleVertexRegion: "europe-west4",
    });

    expect(resolveProviderEndpoint("https://aiplatform.googleapis.com")).toMatchObject({
      endpointClass: "google-vertex",
      hostname: "aiplatform.googleapis.com",
      googleVertexRegion: "global",
    });

    expect(resolveProviderEndpoint("https://proxy.example.com/google")).toMatchObject({
      endpointClass: "custom",
      hostname: "proxy.example.com",
    });
  });

  it("classifies native GitHub Copilot endpoints separately from custom hosts", () => {
    expect(resolveProviderEndpoint("https://api.individual.githubcopilot.com")).toMatchObject({
      endpointClass: "github-copilot-native",
      hostname: "api.individual.githubcopilot.com",
    });

    expect(resolveProviderEndpoint("https://api.enterprise.githubcopilot.com")).toMatchObject({
      endpointClass: "github-copilot-native",
      hostname: "api.enterprise.githubcopilot.com",
    });

    expect(resolveProviderEndpoint("https://api.githubcopilot.example.com")).toMatchObject({
      endpointClass: "custom",
      hostname: "api.githubcopilot.example.com",
    });
  });

  it("does not classify malformed or embedded Google host strings as native endpoints", () => {
    expect(resolveProviderEndpoint("proxy/generativelanguage.googleapis.com")).toMatchObject({
      endpointClass: "custom",
      hostname: "proxy",
    });

    expect(resolveProviderEndpoint("https://xgenerativelanguage.googleapis.com")).toMatchObject({
      endpointClass: "custom",
      hostname: "xgenerativelanguage.googleapis.com",
    });

    expect(resolveProviderEndpoint("proxy/aiplatform.googleapis.com")).toMatchObject({
      endpointClass: "custom",
      hostname: "proxy",
    });

    expect(resolveProviderEndpoint("https://xaiplatform.googleapis.com")).toMatchObject({
      endpointClass: "custom",
      hostname: "xaiplatform.googleapis.com",
    });
  });

  it("does not trust schemeless or embedded trusted-provider substrings", () => {
    expect(resolveProviderEndpoint("api.anthropic.com.attacker.example")).toMatchObject({
      endpointClass: "custom",
      hostname: "api.anthropic.com.attacker.example",
    });

    expect(resolveProviderEndpoint("api.openai.com.attacker.example")).toMatchObject({
      endpointClass: "custom",
      hostname: "api.openai.com.attacker.example",
    });

    expect(resolveProviderEndpoint("attacker.example/?target=api.openai.com")).toMatchObject({
      endpointClass: "custom",
      hostname: "attacker.example",
    });

    expect(resolveProviderEndpoint("openrouter.ai.attacker.example")).toMatchObject({
      endpointClass: "custom",
      hostname: "openrouter.ai.attacker.example",
    });
  });

  it("ignores non-http schemes when normalizing native comparable base URLs", () => {
    expect(resolveProviderEndpoint("javascript:alert(1)")).toMatchObject({
      endpointClass: "invalid",
    });
  });

  it("applies no OpenAI attribution to audio routes", () => {
    expect(
      resolveProviderRequestPolicy({
        provider: "openai",
        api: "openai-audio-transcriptions",
        baseUrl: "https://api.openai.com/v1",
        transport: "media-understanding",
        capability: "audio",
      }),
    ).toMatchObject({
      attributionProvider: undefined,
      allowsHiddenAttribution: false,
    });

    expect(
      resolveProviderRequestPolicy({
        provider: "openai",
        api: "openai-responses",
        baseUrl: "https://api.openai.com/v1",
        transport: "media-understanding",
        capability: "audio",
      }),
    ).toMatchObject({
      attributionProvider: undefined,
      allowsHiddenAttribution: false,
    });

    expect(
      resolveProviderRequestPolicy({
        provider: "openai",
        api: "not-openai-audio",
        baseUrl: "https://api.openai.com/v1",
        transport: "media-understanding",
        capability: "audio",
      }),
    ).toMatchObject({
      attributionProvider: undefined,
      allowsHiddenAttribution: false,
    });
  });

  it("resolves centralized request capabilities for native and proxied routes", () => {
    expect(
      resolveProviderRequestCapabilities({
        provider: "openai",
        api: "openai-responses",
        baseUrl: "https://api.openai.com/v1",
        capability: "llm",
        transport: "stream",
      }),
    ).toMatchObject({
      endpointClass: "openai-public",
      allowsOpenAIServiceTier: true,
      supportsOpenAIReasoningCompatPayload: true,
      allowsResponsesStore: true,
      supportsResponsesStoreField: true,
      shouldStripResponsesPromptCache: false,
    });

    expect(
      resolveProviderRequestCapabilities({
        provider: "anthropic",
        api: "anthropic-messages",
        capability: "llm",
        transport: "stream",
      }),
    ).toMatchObject({
      endpointClass: "default",
      allowsAnthropicServiceTier: true,
    });

    expect(
      resolveProviderRequestCapabilities({
        provider: "custom-proxy",
        api: "openai-responses",
        baseUrl: "https://proxy.example.com/v1",
        capability: "llm",
        transport: "stream",
      }),
    ).toMatchObject({
      endpointClass: "custom",
      allowsOpenAIServiceTier: false,
      supportsOpenAIReasoningCompatPayload: false,
      allowsResponsesStore: false,
      supportsResponsesStoreField: true,
      shouldStripResponsesPromptCache: true,
    });
  });

  it("respects compat.supportsPromptCacheKey override on prompt cache stripping", () => {
    // compat.supportsPromptCacheKey = true disables the strip even on a
    // proxy-like endpoint that would otherwise trigger it.
    expect(
      resolveProviderRequestCapabilities({
        provider: "custom-proxy",
        api: "openai-responses",
        baseUrl: "https://proxy.example.com/v1",
        capability: "llm",
        transport: "stream",
        compat: { supportsPromptCacheKey: true },
      }),
    ).toMatchObject({
      endpointClass: "custom",
      shouldStripResponsesPromptCache: false,
    });

    // compat.supportsPromptCacheKey = false forces the strip even on a
    // native OpenAI endpoint that would otherwise forward the field.
    expect(
      resolveProviderRequestCapabilities({
        provider: "openai",
        api: "openai-responses",
        baseUrl: "https://api.openai.com/v1",
        capability: "llm",
        transport: "stream",
        compat: { supportsPromptCacheKey: false },
      }),
    ).toMatchObject({
      endpointClass: "openai-public",
      shouldStripResponsesPromptCache: true,
    });

    // compat.supportsPromptCacheKey unset preserves the existing default
    // (strip on proxy-like responses endpoints, preserving the fix from
    // #48155 for providers that reject the field).
    expect(
      resolveProviderRequestCapabilities({
        provider: "custom-proxy",
        api: "openai-responses",
        baseUrl: "https://proxy.example.com/v1",
        capability: "llm",
        transport: "stream",
      }),
    ).toMatchObject({
      shouldStripResponsesPromptCache: true,
    });
  });

  it("resolves the Kimi K2 compat family for Ollama cloud models", () => {
    expect(
      resolveProviderRequestCapabilities({
        provider: "ollama",
        modelId: "kimi-k2.5:cloud",
        capability: "llm",
        transport: "stream",
      }),
    ).toMatchObject({
      compatibilityFamily: "moonshot",
    });
  });

  it("treats native GitHub Copilot base URLs as known native endpoints", () => {
    expect(
      resolveProviderRequestCapabilities({
        provider: "github-copilot",
        api: "openai-responses",
        baseUrl: "https://api.individual.githubcopilot.com",
        capability: "llm",
        transport: "http",
      }),
    ).toMatchObject({
      endpointClass: "github-copilot-native",
      knownProviderFamily: "github-copilot",
      isKnownNativeEndpoint: true,
    });
  });

  it("resolves a provider capability matrix for representative native and proxied routes", () => {
    const cases = [
      {
        name: "native OpenAI responses",
        input: {
          provider: "openai",
          api: "openai-responses",
          baseUrl: "https://api.openai.com/v1",
          capability: "llm" as const,
          transport: "stream" as const,
        },
        expected: {
          knownProviderFamily: "openai-family",
          endpointClass: "openai-public",
          isKnownNativeEndpoint: true,
          allowsOpenAIServiceTier: true,
          supportsOpenAIReasoningCompatPayload: true,
          allowsResponsesStore: true,
          supportsResponsesStoreField: true,
          shouldStripResponsesPromptCache: false,
          allowsAnthropicServiceTier: false,
          supportsNativeStreamingUsageCompat: false,
        },
      },
      {
        name: "proxied OpenAI responses",
        input: {
          provider: "openai",
          api: "openai-responses",
          baseUrl: "https://proxy.example.com/v1",
          capability: "llm" as const,
          transport: "stream" as const,
        },
        expected: {
          knownProviderFamily: "openai-family",
          endpointClass: "custom",
          isKnownNativeEndpoint: false,
          allowsOpenAIServiceTier: false,
          supportsOpenAIReasoningCompatPayload: false,
          allowsResponsesStore: false,
          supportsResponsesStoreField: true,
          shouldStripResponsesPromptCache: true,
          allowsAnthropicServiceTier: false,
          supportsNativeStreamingUsageCompat: false,
        },
      },
      {
        name: "direct Anthropic messages",
        input: {
          provider: "anthropic",
          api: "anthropic-messages",
          baseUrl: "https://api.anthropic.com/v1",
          capability: "llm" as const,
          transport: "stream" as const,
        },
        expected: {
          knownProviderFamily: "anthropic",
          endpointClass: "anthropic-public",
          isKnownNativeEndpoint: true,
          allowsOpenAIServiceTier: false,
          supportsOpenAIReasoningCompatPayload: false,
          allowsResponsesStore: false,
          supportsResponsesStoreField: false,
          shouldStripResponsesPromptCache: false,
          allowsAnthropicServiceTier: true,
          supportsNativeStreamingUsageCompat: false,
        },
      },
      {
        name: "proxied custom anthropic api",
        input: {
          provider: "custom-anthropic",
          api: "anthropic-messages",
          baseUrl: "https://proxy.example.com/anthropic",
          capability: "llm" as const,
          transport: "stream" as const,
        },
        expected: {
          endpointClass: "custom",
          isKnownNativeEndpoint: false,
          allowsAnthropicServiceTier: false,
          supportsOpenAIReasoningCompatPayload: false,
          supportsResponsesStoreField: false,
          supportsNativeStreamingUsageCompat: false,
        },
      },
      {
        name: "native OpenRouter responses",
        input: {
          provider: "openrouter",
          api: "openai-responses",
          baseUrl: "https://openrouter.ai/api/v1",
          capability: "llm" as const,
          transport: "stream" as const,
        },
        expected: {
          knownProviderFamily: "openrouter",
          endpointClass: "openrouter",
          isKnownNativeEndpoint: true,
          allowsOpenAIServiceTier: false,
          supportsOpenAIReasoningCompatPayload: false,
          allowsResponsesStore: false,
          supportsResponsesStoreField: true,
          shouldStripResponsesPromptCache: true,
          allowsAnthropicServiceTier: false,
          supportsNativeStreamingUsageCompat: false,
        },
      },
      {
        name: "native Google Gemini api",
        input: {
          provider: "google",
          api: "google-generative-ai",
          baseUrl: "https://generativelanguage.googleapis.com",
          capability: "llm" as const,
          transport: "stream" as const,
        },
        expected: {
          knownProviderFamily: "google",
          endpointClass: "google-generative-ai",
          isKnownNativeEndpoint: true,
          allowsOpenAIServiceTier: false,
          supportsOpenAIReasoningCompatPayload: false,
          allowsResponsesStore: false,
          supportsResponsesStoreField: false,
          shouldStripResponsesPromptCache: false,
          allowsAnthropicServiceTier: false,
          supportsNativeStreamingUsageCompat: false,
        },
      },
      {
        name: "native GitHub Copilot responses",
        input: {
          provider: "github-copilot",
          api: "openai-responses",
          baseUrl: "https://api.individual.githubcopilot.com",
          capability: "llm" as const,
          transport: "stream" as const,
        },
        expected: {
          knownProviderFamily: "github-copilot",
          endpointClass: "github-copilot-native",
          isKnownNativeEndpoint: true,
          allowsOpenAIServiceTier: false,
          supportsOpenAIReasoningCompatPayload: false,
          allowsResponsesStore: false,
          supportsResponsesStoreField: true,
          shouldStripResponsesPromptCache: true,
          allowsAnthropicServiceTier: false,
          supportsNativeStreamingUsageCompat: false,
        },
      },
      {
        name: "native OpenAI Codex responses",
        input: {
          provider: "openai-codex",
          api: "openai-codex-responses",
          baseUrl: "https://chatgpt.com/backend-api/codex",
          capability: "llm" as const,
          transport: "stream" as const,
        },
        expected: {
          knownProviderFamily: "openai-family",
          endpointClass: "openai-codex",
          isKnownNativeEndpoint: true,
          allowsOpenAIServiceTier: true,
          supportsOpenAIReasoningCompatPayload: true,
          allowsResponsesStore: false,
          supportsResponsesStoreField: true,
          shouldStripResponsesPromptCache: false,
          allowsAnthropicServiceTier: false,
          supportsNativeStreamingUsageCompat: false,
        },
      },
    ];

    for (const testCase of cases) {
      expect(resolveProviderRequestCapabilities(testCase.input), testCase.name).toMatchObject(
        testCase.expected,
      );
    }
  });
});
