import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { CompiledConfiguredBinding, ConfiguredBindingChannel } from "./binding-types.js";
export type CompiledConfiguredBindingRegistry = {
    rulesByChannel: Map<ConfiguredBindingChannel, CompiledConfiguredBinding[]>;
};
export declare function resolveCompiledBindingRegistry(cfg: EnclawedConfig): CompiledConfiguredBindingRegistry;
export declare function primeCompiledBindingRegistry(cfg: EnclawedConfig): CompiledConfiguredBindingRegistry;
export declare function countCompiledBindingRegistry(registry: CompiledConfiguredBindingRegistry): {
    bindingCount: number;
    channelCount: number;
};
