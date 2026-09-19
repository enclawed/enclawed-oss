import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { AnyAgentTool } from "./tools/common.js";
type LspServerCapabilities = {
    hoverProvider?: boolean;
    completionProvider?: boolean;
    definitionProvider?: boolean;
    referencesProvider?: boolean;
    diagnosticProvider?: boolean;
    [key: string]: unknown;
};
export type BundleLspToolRuntime = {
    tools: AnyAgentTool[];
    sessions: Array<{
        serverName: string;
        capabilities: LspServerCapabilities;
    }>;
    dispose: () => Promise<void>;
};
export declare function createBundleLspToolRuntime(params: {
    workspaceDir: string;
    cfg?: EnclawedConfig;
    reservedToolNames?: Iterable<string>;
}): Promise<BundleLspToolRuntime>;
export {};
