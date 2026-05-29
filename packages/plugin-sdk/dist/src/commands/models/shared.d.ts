import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "../../agents/defaults.js";
import { modelKey } from "../../agents/model-selection.js";
import { type EnclawedConfig } from "../../config/config.js";
import type { AgentModelEntryConfig } from "../../config/types.agent-defaults.js";
export { normalizeAlias } from "./alias-name.js";
export { isLocalBaseUrl } from "./list.local-url.js";
export declare const ensureFlagCompatibility: (opts: {
    json?: boolean;
    plain?: boolean;
}) => void;
export declare const formatTokenK: (value?: number | null) => string;
export declare const formatMs: (value?: number | null) => string;
export declare function loadValidConfigOrThrow(): Promise<EnclawedConfig>;
export declare function updateConfig(mutator: (cfg: EnclawedConfig) => EnclawedConfig): Promise<EnclawedConfig>;
export declare function resolveModelTarget(params: {
    raw: string;
    cfg: EnclawedConfig;
}): {
    provider: string;
    model: string;
};
export declare function resolveModelKeysFromEntries(params: {
    cfg: EnclawedConfig;
    entries: readonly string[];
}): string[];
export declare function buildAllowlistSet(cfg: EnclawedConfig): Set<string>;
export declare function resolveKnownAgentId(params: {
    cfg: EnclawedConfig;
    rawAgentId?: string | null;
}): string | undefined;
export type PrimaryFallbackConfig = {
    primary?: string;
    fallbacks?: string[];
};
export declare function upsertCanonicalModelConfigEntry(models: Record<string, AgentModelEntryConfig>, params: {
    provider: string;
    model: string;
}): string;
export declare function mergePrimaryFallbackConfig(existing: PrimaryFallbackConfig | undefined, patch: {
    primary?: string;
    fallbacks?: string[];
}): PrimaryFallbackConfig;
export declare function applyDefaultModelPrimaryUpdate(params: {
    cfg: EnclawedConfig;
    modelRaw: string;
    field: "model" | "imageModel";
}): EnclawedConfig;
export { modelKey };
export { DEFAULT_MODEL, DEFAULT_PROVIDER };
/**
 * Model key format: "provider/model"
 *
 * The model key is displayed in `/model status` and used to reference models.
 * When using `/model <key>`, use the exact format shown (e.g., "openrouter/moonshotai/kimi-k2").
 *
 * For providers with hierarchical model IDs (e.g., OpenRouter), the model ID may include
 * sub-providers (e.g., "moonshotai/kimi-k2"), resulting in a key like "openrouter/moonshotai/kimi-k2".
 */
