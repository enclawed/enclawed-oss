import type { EnclawedConfig } from "@enclawed/plugin-sdk/config-runtime";
export declare function applyQaSetup(params: {
    cfg: EnclawedConfig;
    accountId: string;
    input: Record<string, unknown>;
}): EnclawedConfig;
