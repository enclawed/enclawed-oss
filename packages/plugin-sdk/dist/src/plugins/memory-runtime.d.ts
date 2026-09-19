import type { EnclawedConfig } from "../config/types.enclawed.js";
export declare function getActiveMemorySearchManager(params: {
    cfg: EnclawedConfig;
    agentId: string;
    purpose?: "default" | "status";
}): Promise<{
    manager: import("./memory-state.js").RegisteredMemorySearchManager | null;
    error?: string;
}>;
export declare function resolveActiveMemoryBackendConfig(params: {
    cfg: EnclawedConfig;
    agentId: string;
}): import("./memory-state.js").MemoryRuntimeBackendConfig | null;
export declare function closeActiveMemorySearchManagers(cfg?: EnclawedConfig): Promise<void>;
