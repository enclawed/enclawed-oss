import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { SandboxConfig, SandboxToolPolicyResolved } from "./types.js";
export declare function resolveSandboxRuntimeStatus(params: {
    cfg?: EnclawedConfig;
    sessionKey?: string;
}): {
    agentId: string;
    sessionKey: string;
    mainSessionKey: string;
    mode: SandboxConfig["mode"];
    sandboxed: boolean;
    toolPolicy: SandboxToolPolicyResolved;
};
export declare function formatSandboxToolPolicyBlockedMessage(params: {
    cfg?: EnclawedConfig;
    sessionKey?: string;
    toolName: string;
}): string | undefined;
