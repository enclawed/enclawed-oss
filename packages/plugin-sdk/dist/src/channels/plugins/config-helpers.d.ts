import type { EnclawedConfig } from "../../config/types.enclawed.js";
export declare function setAccountEnabledInConfigSection(params: {
    cfg: EnclawedConfig;
    sectionKey: string;
    accountId: string;
    enabled: boolean;
    allowTopLevel?: boolean;
}): EnclawedConfig;
export declare function deleteAccountFromConfigSection(params: {
    cfg: EnclawedConfig;
    sectionKey: string;
    accountId: string;
    clearBaseFields?: string[];
}): EnclawedConfig;
export declare function clearAccountEntryFields<TAccountEntry extends object>(params: {
    accounts?: Record<string, TAccountEntry>;
    accountId: string;
    fields: string[];
    isValueSet?: (value: unknown) => boolean;
    markClearedOnFieldPresence?: boolean;
}): {
    nextAccounts?: Record<string, TAccountEntry>;
    changed: boolean;
    cleared: boolean;
};
