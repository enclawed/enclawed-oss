import { SettingsManager } from "@mariozechner/pi-coding-agent";
import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { BundleMcpServerConfig } from "../plugins/bundle-mcp.js";
export declare const DEFAULT_EMBEDDED_PI_PROJECT_SETTINGS_POLICY = "sanitize";
export declare const SANITIZED_PROJECT_PI_KEYS: readonly ["shellPath", "shellCommandPrefix"];
export type EmbeddedPiProjectSettingsPolicy = "trusted" | "sanitize" | "ignore";
type PiSettingsSnapshot = ReturnType<SettingsManager["getGlobalSettings"]> & {
    mcpServers?: Record<string, BundleMcpServerConfig>;
};
export declare function loadEnabledBundlePiSettingsSnapshot(params: {
    cwd: string;
    cfg?: EnclawedConfig;
}): PiSettingsSnapshot;
export declare function resolveEmbeddedPiProjectSettingsPolicy(cfg?: EnclawedConfig): EmbeddedPiProjectSettingsPolicy;
export declare function buildEmbeddedPiSettingsSnapshot(params: {
    globalSettings: PiSettingsSnapshot;
    pluginSettings?: PiSettingsSnapshot;
    projectSettings: PiSettingsSnapshot;
    policy: EmbeddedPiProjectSettingsPolicy;
}): PiSettingsSnapshot;
export declare function createEmbeddedPiSettingsManager(params: {
    cwd: string;
    agentDir: string;
    cfg?: EnclawedConfig;
}): SettingsManager;
export declare function createPreparedEmbeddedPiSettingsManager(params: {
    cwd: string;
    agentDir: string;
    cfg?: EnclawedConfig;
    /** Resolved context window budget so reserve-token floor can be capped for small models. */
    contextTokenBudget?: number;
}): SettingsManager;
export {};
