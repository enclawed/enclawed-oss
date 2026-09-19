import type { EnclawedConfig } from "../../../config/types.enclawed.js";
export declare function listLegacyWebFetchConfigPaths(raw: unknown): string[];
export declare function normalizeLegacyWebFetchConfig<T>(raw: T): T;
export declare function migrateLegacyWebFetchConfig<T>(raw: T): {
    config: T;
    changes: string[];
};
export declare function resolvePluginWebFetchConfig(config: EnclawedConfig | undefined, pluginId: string): Record<string, unknown> | undefined;
