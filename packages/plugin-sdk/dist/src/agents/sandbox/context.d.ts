import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { SandboxContext, SandboxDockerConfig, SandboxWorkspaceInfo } from "./types.js";
export declare function resolveSandboxDockerUser(params: {
    docker: SandboxDockerConfig;
    workspaceDir: string;
    stat?: (workspaceDir: string) => Promise<{
        uid: number;
        gid: number;
    }>;
}): Promise<SandboxDockerConfig>;
export declare function resolveSandboxContext(params: {
    config?: EnclawedConfig;
    sessionKey?: string;
    workspaceDir?: string;
}): Promise<SandboxContext | null>;
export declare function ensureSandboxWorkspaceForSession(params: {
    config?: EnclawedConfig;
    sessionKey?: string;
    workspaceDir?: string;
}): Promise<SandboxWorkspaceInfo | null>;
