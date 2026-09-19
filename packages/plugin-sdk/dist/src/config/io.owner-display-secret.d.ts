import type { EnclawedConfig } from "./types.enclawed.js";
export type OwnerDisplaySecretPersistState = {
    pendingByPath: Map<string, string>;
    persistInFlight: Set<string>;
    persistWarned: Set<string>;
};
export declare function persistGeneratedOwnerDisplaySecret(params: {
    config: EnclawedConfig;
    configPath: string;
    generatedSecret?: string;
    logger: Pick<typeof console, "warn">;
    state: OwnerDisplaySecretPersistState;
    persistConfig: (config: EnclawedConfig, options: {
        expectedConfigPath: string;
    }) => Promise<unknown>;
}): EnclawedConfig;
