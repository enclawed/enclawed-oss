import { type Api, type Model } from "@mariozechner/pi-ai";
import type { AgentModelConfig } from "../../config/types.agents-shared.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { ImageModelConfig } from "./image-tool.helpers.js";
import { type ToolModelConfig } from "./model-config.helpers.js";
type TextToolAttempt = {
    provider: string;
    model: string;
    error: string;
};
type TextToolResult = {
    text: string;
    provider: string;
    model: string;
    attempts: TextToolAttempt[];
};
type GenerationModelRef = {
    provider: string;
    model: string;
};
type ParseGenerationModelRef = (raw: string | undefined) => GenerationModelRef | null;
type MediaReferenceDetailEntry = {
    rewrittenFrom?: string;
};
type TaskRunDetailHandle = {
    taskId: string;
    runId: string;
};
export declare function applyImageModelConfigDefaults(cfg: EnclawedConfig | undefined, imageModelConfig: ImageModelConfig): EnclawedConfig | undefined;
export declare function applyImageGenerationModelConfigDefaults(cfg: EnclawedConfig | undefined, imageGenerationModelConfig: ToolModelConfig): EnclawedConfig | undefined;
export declare function applyVideoGenerationModelConfigDefaults(cfg: EnclawedConfig | undefined, videoGenerationModelConfig: ToolModelConfig): EnclawedConfig | undefined;
export declare function applyMusicGenerationModelConfigDefaults(cfg: EnclawedConfig | undefined, musicGenerationModelConfig: ToolModelConfig): EnclawedConfig | undefined;
type CapabilityProvider = {
    id: string;
    aliases?: string[];
    defaultModel?: string;
    isConfigured?: (ctx: {
        cfg?: EnclawedConfig;
        agentDir?: string;
    }) => boolean;
};
export declare function findCapabilityProviderById<T extends CapabilityProvider>(params: {
    providers: T[];
    providerId?: string;
}): T | undefined;
export declare function isCapabilityProviderConfigured<T extends CapabilityProvider>(params: {
    providers: T[];
    provider?: T;
    providerId?: string;
    cfg?: EnclawedConfig;
    agentDir?: string;
}): boolean;
export declare function resolveSelectedCapabilityProvider<T extends CapabilityProvider>(params: {
    providers: T[];
    modelConfig: ToolModelConfig;
    modelOverride?: string;
    parseModelRef: ParseGenerationModelRef;
}): T | undefined;
export declare function resolveCapabilityModelCandidatesForTool<T extends CapabilityProvider>(params: {
    cfg?: EnclawedConfig;
    agentDir?: string;
    providers: T[];
}): string[];
export declare function resolveCapabilityModelConfigForTool<T extends CapabilityProvider>(params: {
    cfg?: EnclawedConfig;
    agentDir?: string;
    modelConfig?: AgentModelConfig;
    providers: T[];
}): ToolModelConfig | null;
export declare function resolveGenerateAction<TAction extends string>(params: {
    args: Record<string, unknown>;
    allowed: readonly TAction[];
    defaultAction: TAction;
}): TAction;
export declare function readBooleanToolParam(params: Record<string, unknown>, key: string): boolean | undefined;
export declare function normalizeMediaReferenceInputs(params: {
    args: Record<string, unknown>;
    singularKey: string;
    pluralKey: string;
    maxCount: number;
    label: string;
}): string[];
export declare function buildMediaReferenceDetails<T extends MediaReferenceDetailEntry>(params: {
    entries: readonly T[];
    singleKey: string;
    pluralKey: string;
    getResolvedInput: (entry: T) => string | undefined;
    singleRewriteKey?: string;
}): Record<string, unknown>;
export declare function buildTaskRunDetails(handle: TaskRunDetailHandle | null | undefined): Record<string, unknown>;
export declare function resolveMediaToolLocalRoots(workspaceDirRaw: string | undefined, options?: {
    workspaceOnly?: boolean;
}, _mediaSources?: readonly string[]): string[];
export declare function resolvePromptAndModelOverride(args: Record<string, unknown>, defaultPrompt: string): {
    prompt: string;
    modelOverride?: string;
};
export declare function buildTextToolResult(result: TextToolResult, extraDetails: Record<string, unknown>): {
    content: Array<{
        type: "text";
        text: string;
    }>;
    details: Record<string, unknown>;
};
export declare function resolveModelFromRegistry(params: {
    modelRegistry: {
        find: (provider: string, modelId: string) => unknown;
    };
    provider: string;
    modelId: string;
}): Model<Api>;
export declare function resolveModelRuntimeApiKey(params: {
    model: Model<Api>;
    cfg: EnclawedConfig | undefined;
    agentDir: string;
    authStorage: {
        setRuntimeApiKey: (provider: string, apiKey: string) => void;
    };
}): Promise<string>;
export {};
