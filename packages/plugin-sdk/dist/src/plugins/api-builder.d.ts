import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { PluginRuntime } from "./runtime/types.js";
import type { EnclawedPluginApi, PluginLogger } from "./types.js";
export type BuildPluginApiParams = {
    id: string;
    name: string;
    version?: string;
    description?: string;
    source: string;
    rootDir?: string;
    registrationMode: EnclawedPluginApi["registrationMode"];
    config: EnclawedConfig;
    pluginConfig?: Record<string, unknown>;
    runtime: PluginRuntime;
    logger: PluginLogger;
    resolvePath: (input: string) => string;
    handlers?: Partial<Pick<EnclawedPluginApi, "registerTool" | "registerHook" | "registerHttpRoute" | "registerChannel" | "registerGatewayMethod" | "registerCli" | "registerReload" | "registerNodeHostCommand" | "registerSecurityAuditCollector" | "registerService" | "registerGatewayDiscoveryService" | "registerMigrationProvider" | "registerNodeInvokePolicy" | "registerCliBackend" | "registerTextTransforms" | "registerConfigMigration" | "registerAutoEnableProbe" | "registerProvider" | "registerSpeechProvider" | "registerRealtimeTranscriptionProvider" | "registerRealtimeVoiceProvider" | "registerMediaUnderstandingProvider" | "registerImageGenerationProvider" | "registerVideoGenerationProvider" | "registerMusicGenerationProvider" | "registerWebFetchProvider" | "registerWebSearchProvider" | "registerInteractiveHandler" | "onConversationBindingResolved" | "registerCommand" | "registerContextEngine" | "registerCompactionProvider" | "registerAgentHarness" | "registerAgentToolResultMiddleware" | "registerMemoryCapability" | "registerMemoryPromptSection" | "registerMemoryPromptSupplement" | "registerMemoryCorpusSupplement" | "registerMemoryFlushPlan" | "registerMemoryRuntime" | "registerMemoryEmbeddingProvider" | "on">>;
};
export declare function buildPluginApi(params: BuildPluginApiParams): EnclawedPluginApi;
