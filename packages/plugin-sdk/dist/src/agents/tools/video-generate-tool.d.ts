import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { DeliveryContext } from "../../utils/delivery-context.js";
import { type ToolModelConfig } from "./model-config.helpers.js";
import { type AnyAgentTool, type SandboxFsBridge, type ToolFsPolicy } from "./tool-runtime.helpers.js";
export declare function resolveVideoGenerationModelConfigForTool(params: {
    cfg?: EnclawedConfig;
    agentDir?: string;
}): ToolModelConfig | null;
type VideoGenerateSandboxConfig = {
    root: string;
    bridge: SandboxFsBridge;
};
type VideoGenerateBackgroundScheduler = (work: () => Promise<void>) => void;
export declare function createVideoGenerateTool(options?: {
    config?: EnclawedConfig;
    agentDir?: string;
    agentSessionKey?: string;
    requesterOrigin?: DeliveryContext;
    workspaceDir?: string;
    sandbox?: VideoGenerateSandboxConfig;
    fsPolicy?: ToolFsPolicy;
    scheduleBackgroundWork?: VideoGenerateBackgroundScheduler;
}): AnyAgentTool | null;
export {};
