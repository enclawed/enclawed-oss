import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { DeliveryContext } from "../../utils/delivery-context.js";
import { type ToolModelConfig } from "./model-config.helpers.js";
import { type AnyAgentTool, type SandboxFsBridge, type ToolFsPolicy } from "./tool-runtime.helpers.js";
export declare function resolveMusicGenerationModelConfigForTool(params: {
    cfg?: EnclawedConfig;
    agentDir?: string;
}): ToolModelConfig | null;
type MusicGenerateSandboxConfig = {
    root: string;
    bridge: SandboxFsBridge;
};
type MusicGenerateBackgroundScheduler = (work: () => Promise<void>) => void;
export declare function createMusicGenerateTool(options?: {
    config?: EnclawedConfig;
    agentDir?: string;
    agentSessionKey?: string;
    requesterOrigin?: DeliveryContext;
    workspaceDir?: string;
    sandbox?: MusicGenerateSandboxConfig;
    fsPolicy?: ToolFsPolicy;
    scheduleBackgroundWork?: MusicGenerateBackgroundScheduler;
}): AnyAgentTool | null;
export {};
