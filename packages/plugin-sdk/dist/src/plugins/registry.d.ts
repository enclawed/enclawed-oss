import type { AgentHarness } from "../agents/harness/types.js";
import type { AnyAgentTool } from "../agents/tools/common.js";
import type { ChannelPlugin } from "../channels/plugins/types.plugin.js";
import type { OperatorScope } from "../gateway/operator-scopes.js";
import type { GatewayRequestHandler } from "../gateway/server-methods/types.js";
import { registerInternalHook } from "../hooks/internal-hooks.js";
import type { PluginDiagnostic } from "./manifest-types.js";
import type { PluginHttpRouteRegistration as RegistryTypesPluginHttpRouteRegistration, PluginRecord, PluginRegistry, PluginRegistryParams, PluginTextTransformsRegistration } from "./registry-types.js";
import type { CliBackendPlugin, ImageGenerationProviderPlugin, MusicGenerationProviderPlugin, EnclawedPluginApi, EnclawedPluginChannelRegistration, EnclawedPluginCliCommandDescriptor, EnclawedPluginCliRegistrar, EnclawedPluginCommandDefinition, EnclawedPluginGatewayRuntimeScopeSurface, EnclawedPluginHookOptions, EnclawedPluginNodeHostCommand, EnclawedPluginReloadRegistration, EnclawedPluginSecurityAuditCollector, EnclawedGatewayDiscoveryService, EnclawedPluginNodeInvokePolicy, MediaUnderstandingProviderPlugin, MigrationProviderPlugin, EnclawedPluginService, EnclawedPluginToolFactory, PluginHookHandlerMap, PluginHookName, PluginRegistrationMode, ProviderPlugin, RealtimeTranscriptionProviderPlugin, RealtimeVoiceProviderPlugin, SpeechProviderPlugin, VideoGenerationProviderPlugin, WebSearchProviderPlugin } from "./types.js";
export type PluginHttpRouteRegistration = RegistryTypesPluginHttpRouteRegistration & {
    gatewayRuntimeScopeSurface?: EnclawedPluginGatewayRuntimeScopeSurface;
};
export type { PluginChannelRegistration, PluginChannelSetupRegistration, PluginCliBackendRegistration, PluginCliRegistration, PluginCommandRegistration, PluginConversationBindingResolvedHandlerRegistration, PluginHookRegistration, PluginAgentHarnessRegistration, PluginMemoryEmbeddingProviderRegistration, PluginNodeHostCommandRegistration, PluginProviderRegistration, PluginRecord, PluginRegistry, PluginRegistryParams, PluginReloadRegistration, PluginSecurityAuditCollectorRegistration, PluginServiceRegistration, PluginTextTransformsRegistration, PluginToolRegistration, PluginSpeechProviderRegistration, PluginRealtimeTranscriptionProviderRegistration, PluginRealtimeVoiceProviderRegistration, PluginMediaUnderstandingProviderRegistration, PluginImageGenerationProviderRegistration, PluginVideoGenerationProviderRegistration, PluginMusicGenerationProviderRegistration, PluginWebFetchProviderRegistration, PluginWebSearchProviderRegistration, } from "./registry-types.js";
type PluginTypedHookPolicy = {
    allowPromptInjection?: boolean;
};
export { createEmptyPluginRegistry } from "./registry-empty.js";
export declare function createPluginRegistry(registryParams: PluginRegistryParams): {
    registry: PluginRegistry;
    createApi: (record: PluginRecord, params: {
        config: EnclawedPluginApi["config"];
        pluginConfig?: Record<string, unknown>;
        hookPolicy?: PluginTypedHookPolicy;
        registrationMode?: PluginRegistrationMode;
    }) => EnclawedPluginApi;
    rollbackPluginGlobalSideEffects: (pluginId: string) => void;
    pushDiagnostic: (diag: PluginDiagnostic) => void;
    registerTool: (record: PluginRecord, tool: AnyAgentTool | EnclawedPluginToolFactory, opts?: {
        name?: string;
        names?: string[];
        optional?: boolean;
    }) => void;
    registerChannel: (record: PluginRecord, registration: EnclawedPluginChannelRegistration | ChannelPlugin, mode?: PluginRegistrationMode) => void;
    registerProvider: (record: PluginRecord, provider: ProviderPlugin) => void;
    registerAgentHarness: (record: PluginRecord, harness: AgentHarness) => void;
    registerCliBackend: (record: PluginRecord, backend: CliBackendPlugin) => void;
    registerTextTransforms: (record: PluginRecord, transforms: PluginTextTransformsRegistration["transforms"]) => void;
    registerSpeechProvider: (record: PluginRecord, provider: SpeechProviderPlugin) => void;
    registerRealtimeTranscriptionProvider: (record: PluginRecord, provider: RealtimeTranscriptionProviderPlugin) => void;
    registerRealtimeVoiceProvider: (record: PluginRecord, provider: RealtimeVoiceProviderPlugin) => void;
    registerMediaUnderstandingProvider: (record: PluginRecord, provider: MediaUnderstandingProviderPlugin) => void;
    registerImageGenerationProvider: (record: PluginRecord, provider: ImageGenerationProviderPlugin) => void;
    registerVideoGenerationProvider: (record: PluginRecord, provider: VideoGenerationProviderPlugin) => void;
    registerMusicGenerationProvider: (record: PluginRecord, provider: MusicGenerationProviderPlugin) => void;
    registerWebSearchProvider: (record: PluginRecord, provider: WebSearchProviderPlugin) => void;
    registerGatewayMethod: (record: PluginRecord, method: string, handler: GatewayRequestHandler, opts?: {
        scope?: OperatorScope;
    }) => void;
    registerCli: (record: PluginRecord, registrar: EnclawedPluginCliRegistrar, opts?: {
        commands?: string[];
        descriptors?: EnclawedPluginCliCommandDescriptor[];
    }) => void;
    registerReload: (record: PluginRecord, registration: EnclawedPluginReloadRegistration) => void;
    registerNodeHostCommand: (record: PluginRecord, nodeCommand: EnclawedPluginNodeHostCommand) => void;
    registerSecurityAuditCollector: (record: PluginRecord, collector: EnclawedPluginSecurityAuditCollector) => void;
    registerService: (record: PluginRecord, service: EnclawedPluginService) => void;
    registerGatewayDiscoveryService: (record: PluginRecord, service: EnclawedGatewayDiscoveryService) => void;
    registerMigrationProvider: (record: PluginRecord, provider: MigrationProviderPlugin) => void;
    registerNodeInvokePolicy: (record: PluginRecord, policy: EnclawedPluginNodeInvokePolicy) => void;
    registerCommand: (record: PluginRecord, command: EnclawedPluginCommandDefinition) => void;
    registerHook: (record: PluginRecord, events: string | string[], handler: Parameters<typeof registerInternalHook>[1], opts: EnclawedPluginHookOptions | undefined, config: EnclawedPluginApi["config"]) => void;
    registerTypedHook: <K extends PluginHookName>(record: PluginRecord, hookName: K, handler: PluginHookHandlerMap[K], opts?: {
        priority?: number;
    }, policy?: PluginTypedHookPolicy) => void;
};
