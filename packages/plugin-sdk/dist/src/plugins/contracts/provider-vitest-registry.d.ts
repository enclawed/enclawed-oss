import type { ProviderPlugin } from "../types.js";
export type ProviderContractEntry = {
    pluginId: string;
    provider: ProviderPlugin;
};
export declare function loadVitestProviderContractRegistry(): ProviderContractEntry[];
