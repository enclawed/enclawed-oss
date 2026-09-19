import type { EnclawedPackageManifest, PluginManifest, PluginManifestChannelConfig } from "./manifest.js";
export declare function collectBundledChannelConfigs(params: {
    pluginDir: string;
    manifest: PluginManifest;
    packageManifest?: EnclawedPackageManifest;
}): Record<string, PluginManifestChannelConfig> | undefined;
