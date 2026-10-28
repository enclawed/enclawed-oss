import type { EnclawedConfig } from "../config/types.enclawed.js";
export declare function expectGeneratedTokenPersistedToGatewayAuth(params: {
    generatedToken?: string;
    authToken?: string;
    persistedConfig?: EnclawedConfig;
}): void;
