import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { BundleMcpToolRuntime, SessionMcpRuntime } from "./pi-bundle-mcp-types.js";
export declare function materializeBundleMcpToolsForRun(params: {
    runtime: SessionMcpRuntime;
    reservedToolNames?: Iterable<string>;
    disposeRuntime?: () => Promise<void>;
}): Promise<BundleMcpToolRuntime>;
export declare function createBundleMcpToolRuntime(params: {
    workspaceDir: string;
    cfg?: EnclawedConfig;
    reservedToolNames?: Iterable<string>;
}): Promise<BundleMcpToolRuntime>;
