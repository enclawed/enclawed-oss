import type { EnclawedConfig } from "../../../config/types.enclawed.js";
export { normalizeLegacyTalkConfig } from "./legacy-talk-config-normalizer.js";
export declare function normalizeLegacyBrowserConfig(cfg: EnclawedConfig, changes: string[]): EnclawedConfig;
export declare function seedMissingDefaultAccountsFromSingleAccountBase(cfg: EnclawedConfig, changes: string[]): EnclawedConfig;
export declare function normalizeLegacyNanoBananaSkill(cfg: EnclawedConfig, changes: string[]): EnclawedConfig;
export declare function normalizeLegacyCrossContextMessageConfig(cfg: EnclawedConfig, changes: string[]): EnclawedConfig;
export declare function normalizeLegacyMediaProviderOptions(cfg: EnclawedConfig, changes: string[]): EnclawedConfig;
export declare function normalizeLegacyMistralModelMaxTokens(cfg: EnclawedConfig, changes: string[]): EnclawedConfig;
