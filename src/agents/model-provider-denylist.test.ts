import { builtinProviders, getAllBuiltinModels } from "@mariozechner/pi-ai/providers/all";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  isDeniedModelProvider,
  isDeniedModelProviderEndpoint,
  isDeniedModelProviderRef,
  omitDeniedProviders,
  restrictDeniedModelProviders,
} from "./model-provider-denylist.js";

vi.mock("../plugins/provider-runtime.js", () => ({
  resolveProviderBuiltInModelSuppression: () => undefined,
}));

// Every China-based provider id the upstream pi-ai built-in catalog ships.
const PI_BUILT_IN_CHINA_PROVIDERS = [
  "ant-ling",
  "deepseek",
  "kimi-coding",
  "minimax",
  "minimax-cn",
  "moonshotai",
  "moonshotai-cn",
  "qwen-token-plan",
  "qwen-token-plan-cn",
  "qwen-token-plan-individual",
  "qwen-token-plan-individual-cn",
  "xiaomi",
  "xiaomi-token-plan-ams",
  "xiaomi-token-plan-cn",
  "xiaomi-token-plan-sgp",
  "zai",
  "zai-coding-cn",
];

describe("model provider denylist", () => {
  it.each([
    ...PI_BUILT_IN_CHINA_PROVIDERS,
    "moonshot",
    "kimi",
    "qwen",
    "qwen-portal",
    "modelstudio",
    "dashscope",
    "alibaba",
    "byteplus",
    "volcengine",
    "qianfan",
    "stepfun",
    "tencent",
    "senseaudio",
    "Z.AI",
    " DeepSeek ",
  ])("denies provider id %s", (provider) => {
    expect(isDeniedModelProvider(provider)).toBe(true);
  });

  it.each([
    "anthropic",
    "openai",
    "google",
    "ollama",
    "vllm",
    "sglang",
    "lmstudio",
    "openrouter",
    "together",
    "fireworks",
    "groq",
    "amazon-bedrock",
    "bedrock",
    "nvidia",
    "huggingface",
    "venice",
    "chutes",
    "cerebras",
    "",
    undefined,
  ])("allows provider id %s", (provider) => {
    expect(isDeniedModelProvider(provider)).toBe(false);
  });

  it.each([
    "https://api.deepseek.com/v1",
    "https://api.moonshot.cn/v1",
    "https://api.moonshot.ai/v1",
    "https://open.bigmodel.cn/api/paas/v4",
    "https://api.z.ai/api/paas/v4",
    "https://api.minimaxi.com",
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    "https://ark.cn-beijing.volces.com/api/v3",
    "https://token-plan-sgp.xiaomimimo.com",
    "https://example.com.cn",
    "api.kimi.com",
  ])("denies endpoint %s", (baseUrl) => {
    expect(isDeniedModelProviderEndpoint(baseUrl)).toBe(true);
  });

  it.each([
    "https://api.openai.com/v1",
    "https://openrouter.ai/api/v1",
    "http://127.0.0.1:11434",
    "https://api.together.xyz/v1",
    "https://cn.example.com",
    "https://notdeepseek.com",
    "not a url ::",
    undefined,
  ])("allows endpoint %s", (baseUrl) => {
    expect(isDeniedModelProviderEndpoint(baseUrl)).toBe(false);
  });

  it("omits denied providers from a models.json provider map", () => {
    expect(
      Object.keys(
        omitDeniedProviders({
          openai: { baseUrl: "https://api.openai.com/v1" },
          moonshot: { baseUrl: "https://api.moonshot.ai/v1" },
          relabeled: { baseUrl: "https://api.deepseek.com" },
          ollama: { baseUrl: "http://127.0.0.1:11434" },
        }),
      ),
    ).toEqual(["openai", "ollama"]);
  });
});

describe("model provider denylist enforcement", () => {
  let shouldSuppressBuiltInModel: typeof import("./model-suppression.js").shouldSuppressBuiltInModel;
  let buildSuppressedBuiltInModelError: typeof import("./model-suppression.js").buildSuppressedBuiltInModelError;

  beforeAll(async () => {
    ({ shouldSuppressBuiltInModel, buildSuppressedBuiltInModelError } =
      await import("./model-suppression.js"));
  });

  it("denies exactly the China-based providers in pi's built-in catalog", () => {
    // Drift guard: a pi upgrade that adds a China-hosted provider (by id or by
    // endpoint) fails here until the denylist covers it.
    const denied = builtinProviders()
      .filter((provider) =>
        isDeniedModelProviderRef({
          provider: provider.id,
          baseUrl: getAllBuiltinModels(provider.id as never)[0]?.baseUrl,
        }),
      )
      .map((provider) => provider.id)
      .toSorted();
    expect(denied).toEqual([...PI_BUILT_IN_CHINA_PROVIDERS].toSorted());
    for (const provider of builtinProviders()) {
      for (const model of getAllBuiltinModels(provider.id as never)) {
        const hosted = isDeniedModelProviderEndpoint(model.baseUrl);
        if (hosted) {
          expect(PI_BUILT_IN_CHINA_PROVIDERS).toContain(provider.id);
        }
      }
    }
  });

  it("suppresses denied providers for catalog, listing, and resolution", () => {
    expect(shouldSuppressBuiltInModel({ provider: "deepseek", id: "deepseek-chat" })).toBe(true);
    expect(shouldSuppressBuiltInModel({ provider: "zai-coding-cn", id: "glm-5" })).toBe(true);
    expect(
      shouldSuppressBuiltInModel({
        provider: "custom",
        id: "kimi-k2",
        baseUrl: "https://api.moonshot.ai/v1",
      }),
    ).toBe(true);
    expect(buildSuppressedBuiltInModelError({ provider: "minimax", id: "MiniMax-M2" })).toMatch(
      /not supported by Enclawed/,
    );
    expect(shouldSuppressBuiltInModel({ provider: "ollama", id: "qwen3:32b" })).toBe(false);
  });

  it("hides denied providers from every pi registry surface", async () => {
    const models = [
      { provider: "openai", id: "gpt-5.4", baseUrl: "https://api.openai.com/v1" },
      { provider: "ollama", id: "qwen3:32b", baseUrl: "http://127.0.0.1:11434" },
      { provider: "openrouter", id: "deepseek/deepseek-r1", baseUrl: "https://openrouter.ai/api" },
      { provider: "together", id: "moonshotai/Kimi-K2.5", baseUrl: "https://api.together.ai/v1" },
      { provider: "deepseek", id: "deepseek-chat", baseUrl: "https://api.deepseek.com" },
      { provider: "moonshotai-cn", id: "kimi-k2.5", baseUrl: "https://api.moonshot.cn/v1" },
      { provider: "relabeled", id: "glm-5", baseUrl: "https://open.bigmodel.cn/api" },
    ];
    const registered: string[] = [];
    const registry = restrictDeniedModelProviders({
      getAll: () => models,
      getAvailable: () => models,
      find: (provider: string, id: string) =>
        models.find((m) => m.provider === provider && m.id === id),
      getModelsOfType: (_type: string, provider?: string) =>
        models.filter((m) => !provider || m.provider === provider),
      getAvailableOfType: async (_type: string, provider?: string) =>
        models.filter((m) => !provider || m.provider === provider),
      getProvider: (provider: string) => ({ id: provider }),
      registerProvider: (name: string, _config?: { baseUrl?: string }) => {
        registered.push(name);
      },
    });
    const kept = ["openai/gpt-5.4", "ollama/qwen3:32b", "openrouter/deepseek/deepseek-r1"];
    kept.push("together/moonshotai/Kimi-K2.5");
    const refs = (list: readonly { provider: string; id: string }[]) =>
      list.map((m) => `${m.provider}/${m.id}`);
    expect(refs(registry.getAll())).toEqual(kept);
    expect(refs(registry.getAvailable())).toEqual(kept);
    expect(refs(registry.getModelsOfType("chat"))).toEqual(kept);
    expect(refs(await registry.getAvailableOfType("chat"))).toEqual(kept);
    expect(registry.getModelsOfType("chat", "deepseek")).toEqual([]);
    expect(await registry.getAvailableOfType("chat", "moonshotai-cn")).toEqual([]);
    expect(registry.find("deepseek", "deepseek-chat")).toBeUndefined();
    expect(registry.find("relabeled", "glm-5")).toBeUndefined();
    expect(registry.find("ollama", "qwen3:32b")).toBeDefined();
    expect(registry.getProvider("zai")).toBeUndefined();
    expect(registry.getProvider("openai")).toEqual({ id: "openai" });
    expect(() => registry.registerProvider("minimax")).toThrow(/not supported by Enclawed/);
    expect(() =>
      registry.registerProvider("relabeled", { baseUrl: "https://api.deepseek.com" }),
    ).toThrow(/not supported by Enclawed/);
    registry.registerProvider("vllm", { baseUrl: "http://127.0.0.1:8000/v1" });
    expect(registered).toEqual(["vllm"]);
  });
});
