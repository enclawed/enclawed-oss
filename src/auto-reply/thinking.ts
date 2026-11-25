import { normalizeProviderId } from "../agents/provider-id.js";
import {
  formatThinkingLevels as formatThinkingLevelsFallback,
  listThinkingLevelLabels as listThinkingLevelLabelsFallback,
  listThinkingLevels as listThinkingLevelsFallback,
  resolveThinkingDefaultForModel as resolveThinkingDefaultForModelFallback,
} from "./thinking.shared.js";
import type { ThinkLevel, ThinkingCatalogEntry } from "./thinking.shared.js";
export {
  formatXHighModelHint,
  normalizeElevatedLevel,
  normalizeFastMode,
  normalizeNoticeLevel,
  normalizeReasoningLevel,
  normalizeTraceLevel,
  normalizeThinkLevel,
  normalizeUsageDisplay,
  normalizeVerboseLevel,
  resolveResponseUsageMode,
  resolveElevatedMode,
} from "./thinking.shared.js";
export type {
  ElevatedLevel,
  ElevatedMode,
  NoticeLevel,
  ReasoningLevel,
  TraceLevel,
  ThinkLevel,
  ThinkingCatalogEntry,
  UsageDisplayLevel,
  VerboseLevel,
} from "./thinking.shared.js";
import {
  resolveProviderBinaryThinking,
  resolveProviderDefaultThinkingLevel,
  resolveProviderThinkingProfile,
  resolveProviderXHighThinking,
} from "../plugins/provider-thinking.js";
import {
  normalizeOptionalLowercaseString,
  normalizeOptionalString,
} from "../shared/string-coerce.js";

export function isBinaryThinkingProvider(provider?: string | null, model?: string | null): boolean {
  const providerRaw = normalizeOptionalString(provider);
  const normalizedProvider = providerRaw ? normalizeProviderId(providerRaw) : "";
  if (!normalizedProvider) {
    return false;
  }

  const pluginDecision = resolveProviderBinaryThinking({
    provider: normalizedProvider,
    context: {
      provider: normalizedProvider,
      modelId: normalizeOptionalString(model) ?? "",
    },
  });
  if (typeof pluginDecision === "boolean") {
    return pluginDecision;
  }
  return false;
}

export function supportsXHighThinking(provider?: string | null, model?: string | null): boolean {
  const modelKey = normalizeOptionalLowercaseString(model);
  if (!modelKey) {
    return false;
  }
  const providerRaw = normalizeOptionalString(provider);
  const providerKey = providerRaw ? normalizeProviderId(providerRaw) : "";
  if (providerKey) {
    const pluginDecision = resolveProviderXHighThinking({
      provider: providerKey,
      context: {
        provider: providerKey,
        modelId: modelKey,
      },
    });
    if (typeof pluginDecision === "boolean") {
      return pluginDecision;
    }
  }
  return false;
}

const THINK_LEVELS: ReadonlySet<ThinkLevel> = new Set<ThinkLevel>([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "adaptive",
  "max",
]);

export function listThinkingLevels(provider?: string | null, model?: string | null): ThinkLevel[] {
  // A provider that knows its model's ladder wins outright. Offering the
  // generic list for a model advertising {off, max} suggests levels it does not
  // have, and hides the one it does.
  const providerRaw = normalizeOptionalString(provider);
  const normalizedProvider = providerRaw ? normalizeProviderId(providerRaw) : "";
  if (normalizedProvider) {
    const profile = resolveProviderThinkingProfile({
      provider: normalizedProvider,
      context: {
        provider: normalizedProvider,
        modelId: normalizeOptionalString(model) ?? "",
      },
    });
    // Validated, not normalized: a provider advertises canonical level ids, and
    // normalizeThinkLevel maps aliases -- it would turn an advertised "max"
    // into "high" and drop the very level the provider was announcing.
    const advertised = profile?.levels
      ?.map((entry) => entry.id?.trim().toLowerCase())
      .filter((id): id is ThinkLevel => Boolean(id) && THINK_LEVELS.has(id as ThinkLevel));
    if (advertised?.length) {
      return [...new Set(advertised)];
    }
  }

  const levels = listThinkingLevelsFallback(provider, model);
  if (supportsXHighThinking(provider, model)) {
    // The provider has told us this model's ladder, so offer it exactly and
    // drop "adaptive". Adaptive is the catch-all for a model whose ladder we do
    // not know -- "let the model decide". Once a provider advertises its
    // capabilities there is nothing left to defer.
    return [...levels.filter((level) => level !== "adaptive"), "xhigh"];
  }
  return levels;
}

export function listThinkingLevelLabels(provider?: string | null, model?: string | null): string[] {
  if (isBinaryThinkingProvider(provider, model)) {
    return ["off", "on"];
  }
  if (supportsXHighThinking(provider, model)) {
    return listThinkingLevels(provider, model);
  }
  return listThinkingLevelLabelsFallback(provider, model);
}

export function formatThinkingLevels(
  provider?: string | null,
  model?: string | null,
  separator = ", ",
): string {
  return supportsXHighThinking(provider, model)
    ? listThinkingLevelLabels(provider, model).join(separator)
    : formatThinkingLevelsFallback(provider, model, separator);
}

export function resolveThinkingDefaultForModel(params: {
  provider: string;
  model: string;
  catalog?: ThinkingCatalogEntry[];
}): ThinkLevel {
  const normalizedProvider = normalizeProviderId(params.provider);
  const candidate = params.catalog?.find(
    (entry) => entry.provider === params.provider && entry.id === params.model,
  );
  const pluginDecision = resolveProviderDefaultThinkingLevel({
    provider: normalizedProvider,
    context: {
      provider: normalizedProvider,
      modelId: params.model,
      reasoning: candidate?.reasoning,
    },
  });
  if (pluginDecision) {
    return pluginDecision;
  }
  return resolveThinkingDefaultForModelFallback(params);
}
