import type { EnclawedConfig } from "../../config/types.enclawed.js";
import { type ToolModelConfig } from "./model-config.helpers.js";
import { type AnyAgentTool, type SandboxFsBridge, type ToolFsPolicy } from "./tool-runtime.helpers.js";
export declare function resolveImageGenerationModelConfigForTool(params: {
    cfg?: EnclawedConfig;
    agentDir?: string;
}): ToolModelConfig | null;
type ImageGenerateSandboxConfig = {
    root: string;
    bridge: SandboxFsBridge;
};
export declare function createImageGenerateTool(options?: {
    config?: EnclawedConfig;
    agentDir?: string;
    workspaceDir?: string;
    sandbox?: ImageGenerateSandboxConfig;
    fsPolicy?: ToolFsPolicy;
}): AnyAgentTool | null;
export {};
