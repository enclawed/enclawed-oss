import type { PluginManifestRegistry } from "../plugins/manifest-registry.js";
import type { PluginAutoEnableCandidate } from "./plugin-auto-enable.types.js";
import type { EnclawedConfig } from "./types.enclawed.js";
export declare function detectPluginAutoEnableCandidates(params: {
    config?: EnclawedConfig;
    env?: NodeJS.ProcessEnv;
    manifestRegistry?: PluginManifestRegistry;
}): PluginAutoEnableCandidate[];
