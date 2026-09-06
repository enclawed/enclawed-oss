import type { EnclawedConfig } from "../config/types.enclawed.js";
export type ClaudeBundleCommandSpec = {
    pluginId: string;
    rawName: string;
    description: string;
    promptTemplate: string;
    sourceFilePath: string;
};
export declare function loadEnabledClaudeBundleCommands(params: {
    workspaceDir: string;
    cfg?: EnclawedConfig;
}): ClaudeBundleCommandSpec[];
