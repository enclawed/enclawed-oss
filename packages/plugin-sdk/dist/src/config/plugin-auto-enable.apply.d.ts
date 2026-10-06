import type { PluginManifestRegistry } from "../plugins/manifest-registry.js";
import type { PluginAutoEnableCandidate, PluginAutoEnableResult } from "./plugin-auto-enable.types.js";
import type { EnclawedConfig } from "./types.enclawed.js";
export declare function materializePluginAutoEnableCandidates(params: {
    config?: EnclawedConfig;
    candidates: readonly PluginAutoEnableCandidate[];
    env?: NodeJS.ProcessEnv;
    manifestRegistry?: PluginManifestRegistry;
}): PluginAutoEnableResult;
export declare function applyPluginAutoEnable(params: {
    config?: EnclawedConfig;
    env?: NodeJS.ProcessEnv;
    manifestRegistry?: PluginManifestRegistry;
}): PluginAutoEnableResult;
