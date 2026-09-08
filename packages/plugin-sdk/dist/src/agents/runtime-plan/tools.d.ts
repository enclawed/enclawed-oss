import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { TSchema } from "@sinclair/typebox";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { ProviderRuntimeModel } from "../../plugins/provider-runtime-model.types.js";
import type { AgentRuntimePlan } from "./types.js";
type AgentRuntimeToolPolicyParams<TSchemaType extends TSchema = TSchema, TResult = unknown> = {
    runtimePlan?: AgentRuntimePlan;
    tools: AgentTool<TSchemaType, TResult>[];
    provider: string;
    config?: EnclawedConfig;
    workspaceDir?: string;
    env?: NodeJS.ProcessEnv;
    modelId?: string;
    modelApi?: string | null;
    model?: ProviderRuntimeModel;
};
export declare function normalizeAgentRuntimeTools<TSchemaType extends TSchema = TSchema, TResult = unknown>(params: AgentRuntimeToolPolicyParams<TSchemaType, TResult>): AgentTool<TSchemaType, TResult>[];
export declare function logAgentRuntimeToolDiagnostics(params: AgentRuntimeToolPolicyParams): void;
export {};
