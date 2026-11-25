import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  completeMock: vi.fn(),
  ensureEnclawedModelsJsonMock: vi.fn(async () => {}),
  getApiKeyForModelMock: vi.fn(async () => ({
    apiKey: "oauth-test", // pragma: allowlist secret
    source: "test",
    mode: "oauth",
  })),
  requireApiKeyMock: vi.fn((auth: { apiKey?: string }) => auth.apiKey ?? ""),
  setRuntimeApiKeyMock: vi.fn(),
  discoverModelsMock: vi.fn(),
  fetchMock: vi.fn(),
}));
const {
  completeMock,
  ensureEnclawedModelsJsonMock,
  getApiKeyForModelMock,
  requireApiKeyMock,
  setRuntimeApiKeyMock,
  discoverModelsMock,
  fetchMock,
} = hoisted;

vi.mock("@mariozechner/pi-ai/compat", async () => {
  const actual = await vi.importActual<typeof import("@mariozechner/pi-ai/compat")>(
    "@mariozechner/pi-ai/compat",
  );
  return {
    ...actual,
    complete: completeMock,
  };
});

vi.mock("../agents/models-config.js", async () => ({
  ...(await vi.importActual<typeof import("../agents/models-config.js")>(
    "../agents/models-config.js",
  )),
  ensureEnclawedModelsJson: ensureEnclawedModelsJsonMock,
}));

vi.mock("../agents/model-auth.js", () => ({
  getApiKeyForModel: getApiKeyForModelMock,
  requireApiKey: requireApiKeyMock,
}));

vi.mock("../agents/pi-model-discovery-runtime.js", () => ({
  discoverAuthStorage: () => ({
    setRuntimeApiKey: setRuntimeApiKeyMock,
  }),
  discoverModels: discoverModelsMock,
}));

const { describeImageWithModel } = await import("./image.js");

describe("describeImageWithModel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.clearAllMocks();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: vi.fn(() => null) },
      json: vi.fn(async () => ({})),
      text: vi.fn(async () => ""),
    });
    discoverModelsMock.mockResolvedValue({
      find: vi.fn(() => ({
        provider: "openai",
        id: "gpt-5.4",
        input: ["text", "image"],
        baseUrl: "https://api.openai.com/v1",
      })),
    });
  });

  it("uses generic completion for custom image models", async () => {
    discoverModelsMock.mockResolvedValue({
      find: vi.fn(() => ({
        provider: "anthropic",
        id: "custom-vision",
        input: ["text", "image"],
        baseUrl: "https://api.anthropic.com",
      })),
    });
    completeMock.mockResolvedValue({
      role: "assistant",
      api: "anthropic-messages",
      provider: "anthropic",
      model: "custom-vision",
      stopReason: "stop",
      timestamp: Date.now(),
      content: [{ type: "text", text: "generic ok" }],
    });

    const result = await describeImageWithModel({
      cfg: {},
      agentDir: "/tmp/enclawed-agent",
      provider: "anthropic",
      model: "custom-vision",
      buffer: Buffer.from("png-bytes"),
      fileName: "image.png",
      mime: "image/png",
      prompt: "Describe the image.",
      timeoutMs: 1000,
    });

    expect(result).toEqual({
      text: "generic ok",
      model: "custom-vision",
    });
    expect(completeMock).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes image prompt as system instructions for codex image requests", async () => {
    discoverModelsMock.mockResolvedValue({
      find: vi.fn(() => ({
        provider: "openai-codex",
        id: "gpt-5.4",
        input: ["text", "image"],
        baseUrl: "https://chatgpt.com/backend-api",
      })),
    });
    completeMock.mockResolvedValue({
      role: "assistant",
      api: "openai-codex-responses",
      provider: "openai-codex",
      model: "gpt-5.4",
      stopReason: "stop",
      timestamp: Date.now(),
      content: [{ type: "text", text: "codex ok" }],
    });

    const result = await describeImageWithModel({
      cfg: {},
      agentDir: "/tmp/enclawed-agent",
      provider: "openai-codex",
      model: "gpt-5.4",
      buffer: Buffer.from("png-bytes"),
      fileName: "image.png",
      mime: "image/png",
      prompt: "Describe the image.",
      timeoutMs: 1000,
    });

    expect(result).toEqual({
      text: "codex ok",
      model: "gpt-5.4",
    });
    expect(completeMock).toHaveBeenCalledOnce();
    expect(completeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai-codex",
        id: "gpt-5.4",
      }),
      expect.objectContaining({
        systemPrompt: "Describe the image.",
        messages: [
          expect.objectContaining({
            role: "user",
            content: [
              expect.objectContaining({
                type: "image",
                mimeType: "image/png",
              }),
            ],
          }),
        ],
      }),
      expect.any(Object),
    );
    const [, context] = completeMock.mock.calls[0] ?? [];
    expect(context?.messages?.[0]?.content).toHaveLength(1);
  });

  it("normalizes deprecated google flash ids before lookup and keeps profile auth selection", async () => {
    const findMock = vi.fn((provider: string, modelId: string) => {
      expect(provider).toBe("google");
      expect(modelId).toBe("gemini-3-flash-preview");
      return {
        provider: "google",
        id: "gemini-3-flash-preview",
        input: ["text", "image"],
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      };
    });
    discoverModelsMock.mockResolvedValue({ find: findMock });
    completeMock.mockResolvedValue({
      role: "assistant",
      api: "google-generative-ai",
      provider: "google",
      model: "gemini-3-flash-preview",
      stopReason: "stop",
      timestamp: Date.now(),
      content: [{ type: "text", text: "flash ok" }],
    });

    const result = await describeImageWithModel({
      cfg: {},
      agentDir: "/tmp/enclawed-agent",
      provider: "google",
      model: "gemini-3.1-flash-preview",
      profile: "google:default",
      buffer: Buffer.from("png-bytes"),
      fileName: "image.png",
      mime: "image/png",
      prompt: "Describe the image.",
      timeoutMs: 1000,
    });

    expect(result).toEqual({
      text: "flash ok",
      model: "gemini-3-flash-preview",
    });
    expect(findMock).toHaveBeenCalledOnce();
    expect(getApiKeyForModelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: "google:default",
      }),
    );
    expect(setRuntimeApiKeyMock).toHaveBeenCalledWith("google", "oauth-test");
  });

  it("normalizes gemini 3.1 flash-lite ids before lookup and keeps profile auth selection", async () => {
    const findMock = vi.fn((provider: string, modelId: string) => {
      expect(provider).toBe("google");
      expect(modelId).toBe("gemini-3.1-flash-lite-preview");
      return {
        provider: "google",
        id: "gemini-3.1-flash-lite-preview",
        input: ["text", "image"],
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      };
    });
    discoverModelsMock.mockResolvedValue({ find: findMock });
    completeMock.mockResolvedValue({
      role: "assistant",
      api: "google-generative-ai",
      provider: "google",
      model: "gemini-3.1-flash-lite-preview",
      stopReason: "stop",
      timestamp: Date.now(),
      content: [{ type: "text", text: "flash lite ok" }],
    });

    const result = await describeImageWithModel({
      cfg: {},
      agentDir: "/tmp/enclawed-agent",
      provider: "google",
      model: "gemini-3.1-flash-lite",
      profile: "google:default",
      buffer: Buffer.from("png-bytes"),
      fileName: "image.png",
      mime: "image/png",
      prompt: "Describe the image.",
      timeoutMs: 1000,
    });

    expect(result).toEqual({
      text: "flash lite ok",
      model: "gemini-3.1-flash-lite-preview",
    });
    expect(findMock).toHaveBeenCalledOnce();
    expect(getApiKeyForModelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: "google:default",
      }),
    );
    expect(setRuntimeApiKeyMock).toHaveBeenCalledWith("google", "oauth-test");
  });
});
