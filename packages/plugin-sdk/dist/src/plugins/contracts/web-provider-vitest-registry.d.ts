import type { WebSearchProviderPlugin } from "../types.js";
export type WebSearchProviderContractEntry = {
    pluginId: string;
    provider: WebSearchProviderPlugin;
    credentialValue: unknown;
};
export declare function loadVitestWebSearchProviderContractRegistry(): WebSearchProviderContractEntry[];
