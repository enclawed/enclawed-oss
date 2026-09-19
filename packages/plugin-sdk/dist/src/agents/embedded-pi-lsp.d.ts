import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { BundleLspServerConfig } from "../plugins/bundle-lsp.js";
export type EmbeddedPiLspConfig = {
    lspServers: Record<string, BundleLspServerConfig>;
    diagnostics: Array<{
        pluginId: string;
        message: string;
    }>;
};
export declare function loadEmbeddedPiLspConfig(params: {
    workspaceDir: string;
    cfg?: EnclawedConfig;
}): EmbeddedPiLspConfig;
