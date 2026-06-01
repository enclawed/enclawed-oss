import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { CodexAppServerToolResultEvent } from "../../../plugins/codex-app-server-extension-types.js";
export declare function textToolResult(text: string, details?: Record<string, unknown>): AgentToolResult<unknown>;
export declare function mediaToolResult(text: string, mediaUrl: string, audioAsVoice?: boolean): AgentToolResult<unknown>;
export declare function installEnclawedOwnedToolHooks(params?: {
    adjustedParams?: Record<string, unknown>;
    blockReason?: string;
}): {
    beforeToolCall: import("vitest").Mock<() => Promise<{
        block: boolean;
        blockReason: string;
        params?: undefined;
    } | {
        params: Record<string, unknown>;
        block?: undefined;
        blockReason?: undefined;
    } | {
        block?: undefined;
        blockReason?: undefined;
        params?: undefined;
    }>>;
    afterToolCall: import("vitest").Mock<() => Promise<void>>;
};
/**
 * Installs only the Codex app-server `tool_result` middleware fixture.
 * Pair with `installEnclawedOwnedToolHooks()` when a test asserts before/after hook behavior.
 */
export declare function installCodexToolResultMiddleware(handler: (event: CodexAppServerToolResultEvent) => AgentToolResult<unknown>): {
    middleware: import("vitest").Mock<(event: CodexAppServerToolResultEvent) => Promise<{
        result: AgentToolResult<unknown>;
    }>>;
};
export declare function resetEnclawedOwnedToolHooks(): void;
