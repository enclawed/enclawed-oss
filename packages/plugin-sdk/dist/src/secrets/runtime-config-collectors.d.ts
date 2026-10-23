import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { PluginOrigin } from "../plugins/plugin-origin.types.js";
import type { ResolverContext } from "./runtime-shared.js";
export declare function collectConfigAssignments(params: {
    config: EnclawedConfig;
    context: ResolverContext;
    loadablePluginOrigins?: ReadonlyMap<string, PluginOrigin>;
}): void;
