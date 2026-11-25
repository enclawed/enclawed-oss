import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { EnclawedConfig } from "../config/types.enclawed.js";
import { McpToolPinSet } from "../enclawed/mcp-tool-pins.js";
import type { SessionMcpRuntime, SessionMcpRuntimeManager } from "./pi-bundle-mcp-types.js";
type BundleMcpSession = {
    serverName: string;
    client: Client;
    transport: Transport;
    transportType: "stdio" | "sse" | "streamable-http";
    detachStderr?: () => void;
    /** The tool definitions admitted when the session started (see mcp-tool-pins.ts). */
    pins?: McpToolPinSet;
    /** A re-check of the server's tools/list in progress; calls wait for it. */
    revalidating?: Promise<void>;
};
/**
 * A call refused because the server's tool definitions drifted after
 * admission. `blocked` lets the tool adapters report it as a refusal (see
 * isToolCallBlockedError), not as a failure worth retrying.
 */
export declare class McpToolRevokedError extends Error {
    readonly code: string;
    readonly blocked: true;
    constructor(reason: string, code: string);
}
/**
 * Re-list a server's tools and check them against the admission pins. A
 * listing that fails revokes every tool: an answer that cannot be checked is
 * not trusted.
 */
declare function revalidateSessionTools(sessionId: string, session: BundleMcpSession): Promise<void>;
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
    revalidateSessionTools: typeof revalidateSessionTools;
    resetSessionMcpRuntimeManager(): Promise<void>;
    getCachedSessionIds(): string[];
};
export {};
