/**
 * Enclawed policy: model providers that are based in, or host inference in,
 * the People's Republic of China are never supported. This is the single
 * enclawed-side boundary for that rule. It covers both the providers that
 * used to ship as bundled plugins and the providers that the upstream
 * pi-ai built-in catalog still ships (deepseek, kimi-coding, minimax,
 * moonshotai, qwen-token-plan, xiaomi, zai, ant-ling, and their `-cn` and
 * regional variants).
 *
 * The rule is enforced at these seams, all through this module:
 * - `model-suppression.ts`: built-in model suppression, which the model
 *   catalog, `enclawed models list`, onboarding pickers, and model
 *   resolution (`resolveModel` / `resolveModelAsync`) already consult.
 * - `pi-model-discovery.ts`: the pi `ModelRegistry` wrapper filters
 *   `getAll` / `getAvailable` and refuses `find` for denied providers.
 * - `models-config.plan.ts`: denied providers never reach `models.json`.
 * - `pi-model-discovery.ts` `addEnvBackedPiCredentials`: env keys for denied
 *   providers are never mirrored into pi auth storage.
 *
 * The rule is keyed on provider ids and endpoint hosts, never on model
 * families: open-weight models (Qwen, DeepSeek, GLM, Kimi, MiniMax, ...)
 * served by kept providers (Ollama, vLLM, SGLang, OpenRouter, Together,
 * Fireworks, Bedrock, ...) stay available.
 */

import { normalizeLowercaseStringOrEmpty } from "../shared/string-coerce.js";
import { normalizeProviderId } from "./provider-id.js";

const DENIED_MODEL_PROVIDER_IDS: ReadonlySet<string> = new Set([
  // Alibaba Cloud / Qwen (DashScope, Model Studio, Qwen Token Plan)
  "alibaba",
  "alibaba-cloud",
  "aliyun",
  "bailian",
  "dashscope",
  "modelstudio",
  "model-studio",
  "qwen",
  "qwen-portal",
  "qwencloud",
  // Ant Group
  "ant-ling",
  "antgroup",
  // Baidu
  "baidu",
  "qianfan",
  // ByteDance (Volcengine Ark, BytePlus)
  "ark",
  "byteplus",
  "byteplus-plan",
  "bytedance",
  "doubao",
  "volcengine",
  "volcengine-plan",
  // DeepSeek
  "deepseek",
  // MiniMax
  "minimax",
  "minimax-portal",
  // Moonshot AI (Kimi)
  "kimi",
  "kimi-code",
  "kimi-coding",
  "moonshot",
  "moonshotai",
  // SenseTime / SenseAudio
  "senseaudio",
  "sensetime",
  // SiliconFlow
  "siliconflow",
  // StepFun
  "stepfun",
  "stepfun-plan",
  // Tencent (Hunyuan)
  "hunyuan",
  "tencent",
  "tencent-hunyuan",
  // Xiaomi (MiMo)
  "xiaomi",
  // Zhipu AI (Z.AI / BigModel)
  "bigmodel",
  "z-ai",
  "z.ai",
  "zai",
  "zhipu",
  "zhipuai",
]);

/** Provider id prefixes for regional / plan variants of denied providers. */
const DENIED_MODEL_PROVIDER_ID_PREFIXES: readonly string[] = [
  "qwen-token-plan",
  "xiaomi-token-plan",
  "zai-coding",
];

/**
 * Endpoint host suffixes of denied providers. A host matches when it equals a
 * suffix or ends with `.<suffix>`. `cn` denies every host under the `.cn`
 * country-code TLD.
 */
const DENIED_MODEL_PROVIDER_HOST_SUFFIXES: readonly string[] = [
  "cn",
  "aliyuncs.com",
  "ant-ling.com",
  "baidubce.com",
  "bigmodel.cn",
  "byteplusapi.com",
  "bytepluses.com",
  "deepseek.com",
  "kimi.com",
  "minimax.io",
  "minimaxi.com",
  "moonshot.ai",
  "qianwenaiapi.com",
  "qwencloudapi.com",
  "siliconflow.com",
  "stepfun.ai",
  "stepfun.com",
  "tencentcloudapi.com",
  "volces.com",
  "volcengineapi.com",
  "xiaomimimo.com",
  "z.ai",
];

/**
 * Credential env var names of denied providers (from the removed bundled
 * plugins and pi-ai's built-in catalog). They are never read for auth; they
 * are listed so secret hygiene (for example stripping provider credentials
 * from ACP child processes) still removes them if an old shell exports them.
 */
export const DENIED_PROVIDER_SECRET_ENV_VARS: readonly string[] = [
  "ANT_LING_API_KEY",
  "BYTEPLUS_API_KEY",
  "BYTEPLUS_SEED_SPEECH_API_KEY",
  "DASHSCOPE_API_KEY",
  "DEEPSEEK_API_KEY",
  "KIMICODE_API_KEY",
  "KIMI_API_KEY",
  "MINIMAX_API_KEY",
  "MINIMAX_CN_API_KEY",
  "MINIMAX_CODE_PLAN_KEY",
  "MINIMAX_CODING_API_KEY",
  "MINIMAX_OAUTH_TOKEN",
  "MODELSTUDIO_API_KEY",
  "MOONSHOT_API_KEY",
  "QIANFAN_API_KEY",
  "QWEN_API_KEY",
  "QWEN_TOKEN_PLAN_API_KEY",
  "QWEN_TOKEN_PLAN_CN_API_KEY",
  "QWEN_TOKEN_PLAN_INDIVIDUAL_API_KEY",
  "QWEN_TOKEN_PLAN_INDIVIDUAL_CN_API_KEY",
  "QWEN_TOKEN_PLAN_TEAM_API_KEY",
  "QWEN_TOKEN_PLAN_TEAM_CN_API_KEY",
  "SENSEAUDIO_API_KEY",
  "STEPFUN_API_KEY",
  "TOKENHUB_API_KEY",
  "VOLCANO_ENGINE_API_KEY",
  "VOLCENGINE_TTS_API_KEY",
  "VOLCENGINE_TTS_TOKEN",
  "XIAOMI_API_KEY",
  "XIAOMI_TOKEN_PLAN_AMS_API_KEY",
  "XIAOMI_TOKEN_PLAN_CN_API_KEY",
  "XIAOMI_TOKEN_PLAN_SGP_API_KEY",
  "ZAI_API_KEY",
  "ZAI_CODING_CN_API_KEY",
  "Z_AI_API_KEY",
];

/** True when the provider id names a provider Enclawed never supports. */
export function isDeniedModelProvider(provider: string | null | undefined): boolean {
  const raw = normalizeLowercaseStringOrEmpty(provider);
  if (!raw) {
    return false;
  }
  const normalized = normalizeProviderId(raw);
  for (const id of new Set([raw, normalized])) {
    if (DENIED_MODEL_PROVIDER_IDS.has(id)) {
      return true;
    }
    // Regional variants such as `minimax-cn` / `moonshotai-cn`.
    if (id.endsWith("-cn")) {
      return true;
    }
    if (DENIED_MODEL_PROVIDER_ID_PREFIXES.some((prefix) => id.startsWith(prefix))) {
      return true;
    }
  }
  return false;
}

/** True when the endpoint URL (or bare host) belongs to a denied provider. */
export function isDeniedModelProviderEndpoint(baseUrl: string | null | undefined): boolean {
  const trimmed = baseUrl?.trim();
  if (!trimmed) {
    return false;
  }
  let host: string;
  try {
    host = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    return false;
  }
  host = normalizeLowercaseStringOrEmpty(host).replace(/\.+$/, "");
  if (!host) {
    return false;
  }
  return DENIED_MODEL_PROVIDER_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

/** True when either the provider id or its endpoint is denied. */
export function isDeniedModelProviderRef(params: {
  provider?: string | null;
  baseUrl?: string | null;
}): boolean {
  return isDeniedModelProvider(params.provider) || isDeniedModelProviderEndpoint(params.baseUrl);
}

export function buildDeniedModelProviderError(provider: string | null | undefined): string {
  const label = provider?.trim() || "this provider";
  return `Model provider "${label}" is not supported by Enclawed: providers based in or hosted in China are blocked by policy.`;
}

/** Drop denied provider keys (and providers pointing at denied hosts). */
export function omitDeniedProviders<T extends { baseUrl?: string | null }>(
  providers: Record<string, T>,
): Record<string, T> {
  const next: Record<string, T> = {};
  for (const [provider, config] of Object.entries(providers)) {
    if (isDeniedModelProviderRef({ provider, baseUrl: config?.baseUrl })) {
      continue;
    }
    next[provider] = config;
  }
  return next;
}

function readStringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : undefined;
}

function isDeniedModelRecord(value: unknown): boolean {
  return isDeniedModelProviderRef({
    provider: readStringField(value, "provider"),
    baseUrl: readStringField(value, "baseUrl"),
  });
}

function filterDeniedResult(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.filter((entry) => !isDeniedModelRecord(entry));
  }
  return isDeniedModelRecord(value) ? undefined : value;
}

type RegistryLookup = {
  name: string;
  /** Index of the provider-id argument, when the method takes one. */
  providerArg?: number;
  /** What a call for a denied provider returns. */
  denied: () => unknown;
};

const REGISTRY_LOOKUPS: readonly RegistryLookup[] = [
  { name: "getAll", denied: () => [] },
  { name: "getAvailable", denied: () => [] },
  { name: "find", providerArg: 0, denied: () => undefined },
  { name: "findOfType", providerArg: 1, denied: () => undefined },
  { name: "getModelOfType", providerArg: 1, denied: () => undefined },
  { name: "getModelsOfType", providerArg: 1, denied: () => [] },
  { name: "getAvailableOfType", providerArg: 1, denied: () => Promise.resolve([]) },
  { name: "getProvider", providerArg: 0, denied: () => undefined },
  { name: "getRegisteredProviderConfig", providerArg: 0, denied: () => undefined },
  { name: "getRegisteredNativeProvider", providerArg: 0, denied: () => undefined },
];

/**
 * Wraps a pi `ModelRegistry` (any version) in place so providers denied by
 * policy are invisible: list methods drop them, lookups return nothing, and
 * registering one throws. Methods the registry lacks are left alone, so the
 * wrapper keeps working across pi API changes.
 */
export function restrictDeniedModelProviders<T extends object>(registry: T): T {
  const target = registry as Record<string, unknown>;
  for (const lookup of REGISTRY_LOOKUPS) {
    const original = target[lookup.name];
    if (typeof original !== "function") {
      continue;
    }
    const call = (...args: unknown[]): unknown => Reflect.apply(original, registry, args);
    target[lookup.name] = (...args: unknown[]) => {
      const provider = lookup.providerArg === undefined ? undefined : args[lookup.providerArg];
      if (typeof provider === "string" && isDeniedModelProvider(provider)) {
        return lookup.denied();
      }
      const result = call(...args);
      return result instanceof Promise
        ? result.then(filterDeniedResult)
        : filterDeniedResult(result);
    };
  }
  const register = target.registerProvider;
  if (typeof register === "function") {
    target.registerProvider = (...args: unknown[]) => {
      const [first, config] = args;
      const provider = typeof first === "string" ? first : readStringField(first, "id");
      const baseUrl = readStringField(config, "baseUrl") ?? readStringField(first, "baseUrl");
      if (isDeniedModelProviderRef({ provider, baseUrl })) {
        throw new Error(buildDeniedModelProviderError(provider));
      }
      return Reflect.apply(register, registry, args);
    };
  }
  return registry;
}
