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
  handlers?: Partial<
    Pick<
      EnclawedPluginApi,
      | "registerTool"
      | "registerHook"
      | "registerHttpRoute"
      | "registerChannel"
      | "registerGatewayMethod"
      | "registerCli"
      | "registerReload"
      | "registerNodeHostCommand"
      | "registerSecurityAuditCollector"
      | "registerService"
      | "registerGatewayDiscoveryService"
      | "registerMigrationProvider"
      | "registerNodeInvokePolicy"
      | "registerCliBackend"
      | "registerTextTransforms"
      | "registerConfigMigration"
      | "registerAutoEnableProbe"
      | "registerProvider"
      | "registerSpeechProvider"
      | "registerRealtimeTranscriptionProvider"
      | "registerRealtimeVoiceProvider"
      | "registerMediaUnderstandingProvider"
      | "registerImageGenerationProvider"
      | "registerVideoGenerationProvider"
      | "registerMusicGenerationProvider"
      | "registerWebFetchProvider"
      | "registerWebSearchProvider"
      | "registerInteractiveHandler"
      | "onConversationBindingResolved"
      | "registerCommand"
      | "registerContextEngine"
      | "registerCompactionProvider"
      | "registerAgentHarness"
      | "registerAgentToolResultMiddleware"
      | "registerMemoryCapability"
      | "registerMemoryPromptSection"
      | "registerMemoryPromptSupplement"
      | "registerMemoryCorpusSupplement"
      | "registerMemoryFlushPlan"
      | "registerMemoryRuntime"
      | "registerMemoryEmbeddingProvider"
      | "on"
    >
  >;
};

const noopRegisterTool: EnclawedPluginApi["registerTool"] = () => {};
const noopRegisterHook: EnclawedPluginApi["registerHook"] = () => {};
const noopRegisterHttpRoute: EnclawedPluginApi["registerHttpRoute"] = () => {};
const noopRegisterChannel: EnclawedPluginApi["registerChannel"] = () => {};
const noopRegisterGatewayMethod: EnclawedPluginApi["registerGatewayMethod"] = () => {};
const noopRegisterCli: EnclawedPluginApi["registerCli"] = () => {};
const noopRegisterReload: EnclawedPluginApi["registerReload"] = () => {};
const noopRegisterNodeHostCommand: EnclawedPluginApi["registerNodeHostCommand"] = () => {};
const noopRegisterSecurityAuditCollector: EnclawedPluginApi["registerSecurityAuditCollector"] =
  () => {};
const noopRegisterService: EnclawedPluginApi["registerService"] = () => {};
const noopRegisterGatewayDiscoveryService: EnclawedPluginApi["registerGatewayDiscoveryService"] =
  () => {};
const noopRegisterMigrationProvider: EnclawedPluginApi["registerMigrationProvider"] = () => {};
const noopRegisterNodeInvokePolicy: EnclawedPluginApi["registerNodeInvokePolicy"] = () => {};
const noopRegisterCliBackend: EnclawedPluginApi["registerCliBackend"] = () => {};
const noopRegisterTextTransforms: EnclawedPluginApi["registerTextTransforms"] = () => {};
const noopRegisterConfigMigration: EnclawedPluginApi["registerConfigMigration"] = () => {};
const noopRegisterAutoEnableProbe: EnclawedPluginApi["registerAutoEnableProbe"] = () => {};
const noopRegisterProvider: EnclawedPluginApi["registerProvider"] = () => {};
const noopRegisterSpeechProvider: EnclawedPluginApi["registerSpeechProvider"] = () => {};
const noopRegisterRealtimeTranscriptionProvider: EnclawedPluginApi["registerRealtimeTranscriptionProvider"] =
  () => {};
const noopRegisterRealtimeVoiceProvider: EnclawedPluginApi["registerRealtimeVoiceProvider"] =
  () => {};
const noopRegisterMediaUnderstandingProvider: EnclawedPluginApi["registerMediaUnderstandingProvider"] =
  () => {};
const noopRegisterImageGenerationProvider: EnclawedPluginApi["registerImageGenerationProvider"] =
  () => {};
const noopRegisterVideoGenerationProvider: EnclawedPluginApi["registerVideoGenerationProvider"] =
  () => {};
const noopRegisterMusicGenerationProvider: EnclawedPluginApi["registerMusicGenerationProvider"] =
  () => {};
const noopRegisterWebFetchProvider: EnclawedPluginApi["registerWebFetchProvider"] = () => {};
const noopRegisterWebSearchProvider: EnclawedPluginApi["registerWebSearchProvider"] = () => {};
const noopRegisterInteractiveHandler: EnclawedPluginApi["registerInteractiveHandler"] = () => {};
const noopOnConversationBindingResolved: EnclawedPluginApi["onConversationBindingResolved"] =
  () => {};
const noopRegisterCommand: EnclawedPluginApi["registerCommand"] = () => {};
const noopRegisterContextEngine: EnclawedPluginApi["registerContextEngine"] = () => {};
const noopRegisterCompactionProvider: EnclawedPluginApi["registerCompactionProvider"] = () => {};
const noopRegisterAgentHarness: EnclawedPluginApi["registerAgentHarness"] = () => {};
const noopRegisterAgentToolResultMiddleware: EnclawedPluginApi["registerAgentToolResultMiddleware"] =
  () => {};
const noopRegisterMemoryCapability: EnclawedPluginApi["registerMemoryCapability"] = () => {};
const noopRegisterMemoryPromptSection: EnclawedPluginApi["registerMemoryPromptSection"] = () => {};
const noopRegisterMemoryPromptSupplement: EnclawedPluginApi["registerMemoryPromptSupplement"] =
  () => {};
const noopRegisterMemoryCorpusSupplement: EnclawedPluginApi["registerMemoryCorpusSupplement"] =
  () => {};
const noopRegisterMemoryFlushPlan: EnclawedPluginApi["registerMemoryFlushPlan"] = () => {};
const noopRegisterMemoryRuntime: EnclawedPluginApi["registerMemoryRuntime"] = () => {};
const noopRegisterMemoryEmbeddingProvider: EnclawedPluginApi["registerMemoryEmbeddingProvider"] =
  () => {};
const noopOn: EnclawedPluginApi["on"] = () => {};

export function buildPluginApi(params: BuildPluginApiParams): EnclawedPluginApi {
  const handlers = params.handlers ?? {};
  return {
    id: params.id,
    name: params.name,
    version: params.version,
    description: params.description,
    source: params.source,
    rootDir: params.rootDir,
    registrationMode: params.registrationMode,
    config: params.config,
    pluginConfig: params.pluginConfig,
    runtime: params.runtime,
    logger: params.logger,
    registerTool: handlers.registerTool ?? noopRegisterTool,
    registerHook: handlers.registerHook ?? noopRegisterHook,
    registerHttpRoute: handlers.registerHttpRoute ?? noopRegisterHttpRoute,
    registerChannel: handlers.registerChannel ?? noopRegisterChannel,
    registerGatewayMethod: handlers.registerGatewayMethod ?? noopRegisterGatewayMethod,
    registerCli: handlers.registerCli ?? noopRegisterCli,
    registerReload: handlers.registerReload ?? noopRegisterReload,
    registerNodeHostCommand: handlers.registerNodeHostCommand ?? noopRegisterNodeHostCommand,
    registerSecurityAuditCollector:
      handlers.registerSecurityAuditCollector ?? noopRegisterSecurityAuditCollector,
    registerService: handlers.registerService ?? noopRegisterService,
    registerGatewayDiscoveryService:
      handlers.registerGatewayDiscoveryService ?? noopRegisterGatewayDiscoveryService,
    registerMigrationProvider:
      handlers.registerMigrationProvider ?? noopRegisterMigrationProvider,
    registerNodeInvokePolicy: handlers.registerNodeInvokePolicy ?? noopRegisterNodeInvokePolicy,
    registerCliBackend: handlers.registerCliBackend ?? noopRegisterCliBackend,
    registerTextTransforms: handlers.registerTextTransforms ?? noopRegisterTextTransforms,
    registerConfigMigration: handlers.registerConfigMigration ?? noopRegisterConfigMigration,
    registerAutoEnableProbe: handlers.registerAutoEnableProbe ?? noopRegisterAutoEnableProbe,
    registerProvider: handlers.registerProvider ?? noopRegisterProvider,
    registerSpeechProvider: handlers.registerSpeechProvider ?? noopRegisterSpeechProvider,
    registerRealtimeTranscriptionProvider:
      handlers.registerRealtimeTranscriptionProvider ?? noopRegisterRealtimeTranscriptionProvider,
    registerRealtimeVoiceProvider:
      handlers.registerRealtimeVoiceProvider ?? noopRegisterRealtimeVoiceProvider,
    registerMediaUnderstandingProvider:
      handlers.registerMediaUnderstandingProvider ?? noopRegisterMediaUnderstandingProvider,
    registerImageGenerationProvider:
      handlers.registerImageGenerationProvider ?? noopRegisterImageGenerationProvider,
    registerVideoGenerationProvider:
      handlers.registerVideoGenerationProvider ?? noopRegisterVideoGenerationProvider,
    registerMusicGenerationProvider:
      handlers.registerMusicGenerationProvider ?? noopRegisterMusicGenerationProvider,
    registerWebFetchProvider: handlers.registerWebFetchProvider ?? noopRegisterWebFetchProvider,
    registerWebSearchProvider: handlers.registerWebSearchProvider ?? noopRegisterWebSearchProvider,
    registerInteractiveHandler:
      handlers.registerInteractiveHandler ?? noopRegisterInteractiveHandler,
    onConversationBindingResolved:
      handlers.onConversationBindingResolved ?? noopOnConversationBindingResolved,
    registerCommand: handlers.registerCommand ?? noopRegisterCommand,
    registerContextEngine: handlers.registerContextEngine ?? noopRegisterContextEngine,
    registerCompactionProvider:
      handlers.registerCompactionProvider ?? noopRegisterCompactionProvider,
    registerAgentHarness: handlers.registerAgentHarness ?? noopRegisterAgentHarness,
    registerAgentToolResultMiddleware:
      handlers.registerAgentToolResultMiddleware ?? noopRegisterAgentToolResultMiddleware,
    registerMemoryCapability: handlers.registerMemoryCapability ?? noopRegisterMemoryCapability,
    registerMemoryPromptSection:
      handlers.registerMemoryPromptSection ?? noopRegisterMemoryPromptSection,
    registerMemoryPromptSupplement:
      handlers.registerMemoryPromptSupplement ?? noopRegisterMemoryPromptSupplement,
    registerMemoryCorpusSupplement:
      handlers.registerMemoryCorpusSupplement ?? noopRegisterMemoryCorpusSupplement,
    registerMemoryFlushPlan: handlers.registerMemoryFlushPlan ?? noopRegisterMemoryFlushPlan,
    registerMemoryRuntime: handlers.registerMemoryRuntime ?? noopRegisterMemoryRuntime,
    registerMemoryEmbeddingProvider:
      handlers.registerMemoryEmbeddingProvider ?? noopRegisterMemoryEmbeddingProvider,
    resolvePath: params.resolvePath,
    on: handlers.on ?? noopOn,
  };
}
