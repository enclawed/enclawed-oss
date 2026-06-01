import type { AgentContextInjection } from "../config/types.agent-defaults.js";
import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { EmbeddedContextFile } from "./pi-embedded-helpers.js";
import { isWorkspaceBootstrapPending, type WorkspaceBootstrapFile } from "./workspace.js";
export type BootstrapContextMode = "full" | "lightweight";
export type BootstrapContextRunKind = "default" | "heartbeat" | "cron";
export declare const FULL_BOOTSTRAP_COMPLETED_CUSTOM_TYPE = "enclawed:bootstrap-context:full";
export declare function _resetBootstrapWarningCacheForTest(): void;
export declare function resolveContextInjectionMode(config?: EnclawedConfig): AgentContextInjection;
export declare function hasCompletedBootstrapTurn(sessionFile: string): Promise<boolean>;
export declare function makeBootstrapWarn(params: {
    sessionLabel: string;
    workspaceDir?: string;
    warn?: (message: string) => void;
}): ((message: string) => void) | undefined;
export declare function resolveBootstrapFilesForRun(params: {
    workspaceDir: string;
    config?: EnclawedConfig;
    sessionKey?: string;
    sessionId?: string;
    agentId?: string;
    warn?: (message: string) => void;
    contextMode?: BootstrapContextMode;
    runKind?: BootstrapContextRunKind;
}): Promise<WorkspaceBootstrapFile[]>;
export declare function resolveBootstrapContextForRun(params: {
    workspaceDir: string;
    config?: EnclawedConfig;
    sessionKey?: string;
    sessionId?: string;
    agentId?: string;
    warn?: (message: string) => void;
    contextMode?: BootstrapContextMode;
    runKind?: BootstrapContextRunKind;
}): Promise<{
    bootstrapFiles: WorkspaceBootstrapFile[];
    contextFiles: EmbeddedContextFile[];
}>;
export { isWorkspaceBootstrapPending };
