import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { ModelCatalogEntry } from "./model-catalog.types.js";
import { type ModelRef } from "./model-selection-normalize.js";
export type ModelAliasIndex = {
    byAlias: Map<string, {
        alias: string;
        ref: ModelRef;
    }>;
    byKey: Map<string, string[]>;
};
export declare function inferUniqueProviderFromConfiguredModels(params: {
    cfg: EnclawedConfig;
    model: string;
}): string | undefined;
export declare function buildConfiguredAllowlistKeys(params: {
    cfg: EnclawedConfig | undefined;
    defaultProvider: string;
}): Set<string> | null;
export declare function buildModelAliasIndex(params: {
    cfg: EnclawedConfig;
    defaultProvider: string;
    allowPluginNormalization?: boolean;
}): ModelAliasIndex;
export declare function resolveModelRefFromString(params: {
    raw: string;
    defaultProvider: string;
    aliasIndex?: ModelAliasIndex;
    allowPluginNormalization?: boolean;
}): {
    ref: ModelRef;
    alias?: string;
} | null;
export declare function resolveConfiguredModelRef(params: {
    cfg: EnclawedConfig;
    defaultProvider: string;
    defaultModel: string;
    allowPluginNormalization?: boolean;
}): ModelRef;
export declare function buildAllowedModelSet(params: {
    cfg: EnclawedConfig;
    catalog: ModelCatalogEntry[];
    defaultProvider: string;
    defaultModel?: string;
}): {
    allowAny: boolean;
    allowedCatalog: ModelCatalogEntry[];
    allowedKeys: Set<string>;
};
export declare function buildConfiguredModelCatalog(params: {
    cfg: EnclawedConfig;
}): ModelCatalogEntry[];
export type ModelRefStatus = {
    key: string;
    inCatalog: boolean;
    allowAny: boolean;
    allowed: boolean;
};
export declare function getModelRefStatus(params: {
    cfg: EnclawedConfig;
    catalog: ModelCatalogEntry[];
    ref: ModelRef;
    defaultProvider: string;
    defaultModel?: string;
}): ModelRefStatus;
export declare function resolveAllowedModelRef(params: {
    cfg: EnclawedConfig;
    catalog: ModelCatalogEntry[];
    raw: string;
    defaultProvider: string;
    defaultModel?: string;
}): {
    ref: ModelRef;
    key: string;
} | {
    error: string;
};
export declare function resolveHooksGmailModel(params: {
    cfg: EnclawedConfig;
    defaultProvider: string;
}): ModelRef | null;
export declare function normalizeModelSelection(value: unknown): string | undefined;
