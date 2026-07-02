import type { EnclawedPluginApi } from "../plugin-entry.js";
import { createPluginRegistry } from "../../plugins/registry.js";
import { registerProviderPlugins as registerProviders, requireRegisteredProvider as requireProvider } from "../../test-utils/plugin-registration.js";
import type { EnclawedConfig } from "../config-types.js";
import type { PluginRecord } from "../../plugins/registry-types.js";
export { assertNoImportTimeSideEffects } from "./import-side-effects.js";
import { uniqueSortedStrings } from "./string-utils.js";
export { registerProviders, requireProvider, uniqueSortedStrings };
export declare function createPluginRegistryFixture(config?: EnclawedConfig): {
    config: EnclawedConfig;
    registry: {
        registry: import("../../plugins/registry-types.js").PluginRegistry;
        createApi: (record: PluginRecord, params: {
            config: EnclawedPluginApi["config"];
            pluginConfig?: Record<string, unknown>;
            hookPolicy?: {
                allowPromptInjection?: boolean;
            };
            registrationMode?: import("../plugin-runtime.ts").PluginRegistrationMode;
        }) => EnclawedPluginApi;
        rollbackPluginGlobalSideEffects: (pluginId: string) => void;
        pushDiagnostic: (diag: import("../plugin-runtime.ts").PluginDiagnostic) => void;
        registerTool: (record: PluginRecord, tool: import("../plugin-entry.js").AnyAgentTool | import("../plugin-entry.js").EnclawedPluginToolFactory, opts?: {
            name?: string;
            names?: string[];
            optional?: boolean;
        }) => void;
        registerChannel: (record: PluginRecord, registration: import("../plugin-runtime.ts").EnclawedPluginChannelRegistration | import("@enclawed/qa-channel/src/runtime-api.ts").ChannelPlugin, mode?: import("../plugin-runtime.ts").PluginRegistrationMode) => void;
        registerProvider: (record: PluginRecord, provider: import("./provider-catalog.ts").ProviderPlugin) => void;
        registerAgentHarness: (record: PluginRecord, harness: import("../plugin-entry.js").AgentHarness) => void;
        registerCliBackend: (record: PluginRecord, backend: import("../cli-backend.ts").CliBackendPlugin) => void;
        registerTextTransforms: (record: PluginRecord, transforms: import("../../plugins/registry-types.js").PluginTextTransformsRegistration["transforms"]) => void;
        registerSpeechProvider: (record: PluginRecord, provider: import("../plugin-entry.js").SpeechProviderPlugin) => void;
        registerRealtimeTranscriptionProvider: (record: PluginRecord, provider: import("../plugin-entry.js").RealtimeTranscriptionProviderPlugin) => void;
        registerRealtimeVoiceProvider: (record: PluginRecord, provider: import("../plugin-runtime.ts").RealtimeVoiceProviderPlugin) => void;
        registerMediaUnderstandingProvider: (record: PluginRecord, provider: import("../plugin-entry.js").MediaUnderstandingProviderPlugin) => void;
        registerImageGenerationProvider: (record: PluginRecord, provider: import("../image-generation-core.ts").ImageGenerationProviderPlugin) => void;
        registerVideoGenerationProvider: (record: PluginRecord, provider: import("../plugin-runtime.ts").VideoGenerationProviderPlugin) => void;
        registerMusicGenerationProvider: (record: PluginRecord, provider: import("../music-generation-core.ts").MusicGenerationProviderPlugin) => void;
        registerWebSearchProvider: (record: PluginRecord, provider: import("../plugin-runtime.ts").WebSearchProviderPlugin) => void;
        registerGatewayMethod: (record: PluginRecord, method: string, handler: import("../../gateway/server-methods/shared-types.ts").GatewayRequestHandler, opts?: {
            scope?: import("../../gateway/operator-scopes.ts").OperatorScope;
        }) => void;
        registerCli: (record: PluginRecord, registrar: import("../plugin-runtime.ts").EnclawedPluginCliRegistrar, opts?: {
            commands?: string[];
            descriptors?: import("../plugin-runtime.ts").EnclawedPluginCliCommandDescriptor[];
        }) => void;
        registerReload: (record: PluginRecord, registration: import("../plugin-entry.js").EnclawedPluginReloadRegistration) => void;
        registerNodeHostCommand: (record: PluginRecord, nodeCommand: import("../plugin-entry.js").EnclawedPluginNodeHostCommand) => void;
        registerSecurityAuditCollector: (record: PluginRecord, collector: import("../plugin-entry.js").EnclawedPluginSecurityAuditCollector) => void;
        registerService: (record: PluginRecord, service: import("../plugin-entry.js").EnclawedPluginService) => void;
        registerGatewayDiscoveryService: (record: PluginRecord, service: import("../plugin-entry.js").EnclawedGatewayDiscoveryService) => void;
        registerMigrationProvider: (record: PluginRecord, provider: import("../plugin-entry.js").MigrationProviderPlugin) => void;
        registerNodeInvokePolicy: (record: PluginRecord, policy: import("../plugin-entry.js").EnclawedPluginNodeInvokePolicy) => void;
        registerCommand: (record: PluginRecord, command: import("../plugin-entry.js").EnclawedPluginCommandDefinition) => void;
        registerHook: (record: PluginRecord, events: string | string[], handler: Parameters<typeof import("../hook-runtime.ts").registerInternalHook>[1], opts: import("../plugin-runtime.ts").EnclawedPluginHookOptions | undefined, config: EnclawedPluginApi["config"]) => void;
        registerTypedHook: <K extends import("../plugin-runtime.ts").PluginHookName>(record: PluginRecord, hookName: K, handler: import("../plugin-runtime.ts").PluginHookHandlerMap[K], opts?: {
            priority?: number;
        }, policy?: {
            allowPromptInjection?: boolean;
        }) => void;
    };
};
export declare function registerTestPlugin(params: {
    registry: ReturnType<typeof createPluginRegistry>;
    config: EnclawedConfig;
    record: PluginRecord;
    register(api: EnclawedPluginApi): void;
}): void;
export declare function registerVirtualTestPlugin(params: {
    registry: ReturnType<typeof createPluginRegistry>;
    config: EnclawedConfig;
    id: string;
    name: string;
    source?: string;
    kind?: PluginRecord["kind"];
    contracts?: PluginRecord["contracts"];
    register(this: void, api: EnclawedPluginApi): void;
}): void;
