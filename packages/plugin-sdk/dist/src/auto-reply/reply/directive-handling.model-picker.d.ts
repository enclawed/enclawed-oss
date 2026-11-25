import { type ModelRef } from "../../agents/model-selection.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
export type ModelPickerCatalogEntry = {
    provider: string;
    id: string;
    name?: string;
};
export type ModelPickerItem = ModelRef;
export declare function buildModelPickerItems(catalog: ModelPickerCatalogEntry[]): ModelPickerItem[];
export declare function resolveProviderEndpointLabel(provider: string, cfg: EnclawedConfig): {
    endpoint?: string;
    api?: string;
};
