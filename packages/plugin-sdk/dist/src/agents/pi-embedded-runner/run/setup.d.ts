import type { EnclawedConfig } from "../../../config/types.enclawed.js";
import type { ProviderRuntimeModel } from "../../../plugins/provider-runtime-model.types.js";
import type { PluginHookBeforeAgentStartResult } from "../../../plugins/types.js";
import { type ContextWindowInfo } from "../../context-window-guard.js";
type HookContext = {
    agentId?: string;
    sessionKey?: string;
    sessionId: string;
    workspaceDir: string;
    messageProvider?: string;
    trigger?: string;
    channelId?: string;
};
type HookRunnerLike = {
    hasHooks(hookName: string): boolean;
    runBeforeModelResolve(input: {
        prompt: string;
    }, context: HookContext): Promise<{
        providerOverride?: string;
        modelOverride?: string;
    } | undefined>;
    runBeforeAgentStart(input: {
        prompt: string;
    }, context: HookContext): Promise<PluginHookBeforeAgentStartResult | undefined>;
};
export declare function resolveHookModelSelection(params: {
    prompt: string;
    provider: string;
    modelId: string;
    hookRunner?: HookRunnerLike | null;
    hookContext: HookContext;
}): Promise<{
    provider: string;
    modelId: string;
    legacyBeforeAgentStartResult: PluginHookBeforeAgentStartResult | undefined;
}>;
export declare function resolveEffectiveRuntimeModel(params: {
    cfg: EnclawedConfig | undefined;
    provider: string;
    modelId: string;
    runtimeModel: ProviderRuntimeModel;
}): {
    ctxInfo: ContextWindowInfo;
    effectiveModel: ProviderRuntimeModel;
};
export {};
