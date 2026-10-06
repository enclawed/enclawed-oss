import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { SessionMcpRuntime, SessionMcpRuntimeManager } from "./pi-bundle-mcp-types.js";
export declare function createSessionMcpRuntime(params: {
    sessionId: string;
    sessionKey?: string;
    workspaceDir: string;
    cfg?: EnclawedConfig;
}): SessionMcpRuntime;
export declare function getSessionMcpRuntimeManager(): SessionMcpRuntimeManager;
export declare function getOrCreateSessionMcpRuntime(params: {
    sessionId: string;
    sessionKey?: string;
    workspaceDir: string;
    cfg?: EnclawedConfig;
}): Promise<SessionMcpRuntime>;
export declare function disposeSessionMcpRuntime(sessionId: string): Promise<void>;
export declare function disposeAllSessionMcpRuntimes(): Promise<void>;
export declare const __testing: {
    resetSessionMcpRuntimeManager(): Promise<void>;
    getCachedSessionIds(): string[];
};
