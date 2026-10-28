import type { EnclawedConfig } from "../config/types.enclawed.js";
import { type PluginManifestCommandAliasRegistry, type PluginManifestCommandAliasRecord } from "./manifest-command-aliases.js";
export declare function resolveManifestCommandAliasOwner(params: {
    command: string | undefined;
    config?: EnclawedConfig;
    workspaceDir?: string;
    env?: NodeJS.ProcessEnv;
    registry?: PluginManifestCommandAliasRegistry;
}): PluginManifestCommandAliasRecord | undefined;
