import { type EnclawedConfig } from "@enclawed/plugin-sdk/memory-core-host-engine-foundation";
import { type MemorySearchManager } from "@enclawed/plugin-sdk/memory-core-host-engine-storage";
export type MemorySearchManagerResult = {
    manager: MemorySearchManager | null;
    error?: string;
};
export declare function getMemorySearchManager(params: {
    cfg: EnclawedConfig;
    agentId: string;
    purpose?: "default" | "status";
}): Promise<MemorySearchManagerResult>;
export declare function closeAllMemorySearchManagers(): Promise<void>;
