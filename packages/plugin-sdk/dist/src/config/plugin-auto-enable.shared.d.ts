import { type PluginManifestRegistry } from "../plugins/manifest-registry.js";
import type { PluginAutoEnableCandidate, PluginAutoEnableResult } from "./plugin-auto-enable.types.js";
import type { EnclawedConfig } from "./types.enclawed.js";
export type { PluginAutoEnableCandidate, PluginAutoEnableResult, } from "./plugin-auto-enable.types.js";
export declare function configMayNeedPluginAutoEnable(cfg: EnclawedConfig, env: NodeJS.ProcessEnv): boolean;
export declare function resolvePluginAutoEnableCandidateReason(candidate: PluginAutoEnableCandidate): string;
export declare function resolveConfiguredPluginAutoEnableCandidates(params: {
    config: EnclawedConfig;
    env: NodeJS.ProcessEnv;
    registry: PluginManifestRegistry;
}): PluginAutoEnableCandidate[];
export declare function resolvePluginAutoEnableManifestRegistry(params: {
    config: EnclawedConfig;
    env: NodeJS.ProcessEnv;
    manifestRegistry?: PluginManifestRegistry;
}): PluginManifestRegistry;
export declare function materializePluginAutoEnableCandidatesInternal(params: {
    config?: EnclawedConfig;
    candidates: readonly PluginAutoEnableCandidate[];
    env: NodeJS.ProcessEnv;
    manifestRegistry: PluginManifestRegistry;
}): PluginAutoEnableResult;
