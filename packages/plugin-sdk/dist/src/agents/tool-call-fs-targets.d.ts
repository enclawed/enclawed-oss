import type { FsCallTargets } from "../enclawed/agent-tool-guard.js";
import type { SandboxTarget } from "../enclawed/fs-reversibility.js";
export declare function resolveFsCallTargets(toolName: string, params: unknown, where: {
    fsRoot?: string;
    fsSandbox?: SandboxTarget;
}): FsCallTargets | undefined;
