import type { EnclawedConfig } from "../config/types.enclawed.js";
import { emptyPluginConfigSchema } from "../plugins/config-schema.js";
import type { ProviderRuntimeModel } from "../plugins/provider-runtime-model.types.js";
import type {
  AnyAgentTool,
  AgentHarness,
  MediaUnderstandingProviderPlugin,
  EnclawedPluginApi,
  EnclawedPluginCommandDefinition,
  EnclawedPluginConfigSchema,
  EnclawedPluginDefinition,
  EnclawedPluginHttpRouteHandler,
  EnclawedPluginNodeHostCommand,
  EnclawedPluginReloadRegistration,
  EnclawedPluginSecurityAuditCollector,
  EnclawedPluginSecurityAuditContext,
  EnclawedGatewayDiscoveryAdvertiseContext,
  EnclawedGatewayDiscoveryService,
  EnclawedPluginNodeInvokeApprovalDecision,
  EnclawedPluginNodeInvokePolicy,
  EnclawedPluginNodeInvokePolicyApprovalRuntime,
  EnclawedPluginNodeInvokePolicyContext,
  EnclawedPluginNodeInvokePolicyResult,
  EnclawedPluginNodeInvokeTransportResult,
  MigrationApplyResult,
  MigrationDetection,
  MigrationItem,
  MigrationItemAction,
  MigrationItemKind,
  MigrationItemStatus,
  MigrationPlan,
  MigrationProviderContext,
  MigrationProviderPlugin,
  MigrationSummary,
  EnclawedPluginService,
  EnclawedPluginServiceContext,
  EnclawedPluginToolContext,
  EnclawedPluginToolFactory,
  PluginLogger,
  ProviderAugmentModelCatalogContext,
  ProviderAuthContext,
  ProviderAuthDoctorHintContext,
  ProviderAuthMethod,
  ProviderAuthMethodNonInteractiveContext,
  ProviderAuthResult,
  ProviderApplyConfigDefaultsContext,
  ProviderBuildMissingAuthMessageContext,
  ProviderBuildUnknownModelHintContext,
  ProviderBuiltInModelSuppressionContext,
  ProviderBuiltInModelSuppressionResult,
  ProviderCacheTtlEligibilityContext,
  ProviderCatalogContext,
  ProviderCatalogResult,
  ProviderDeferSyntheticProfileAuthContext,
  ProviderDefaultThinkingPolicyContext,
  ProviderDiscoveryContext,
  ProviderFailoverErrorContext,
  ProviderFetchUsageSnapshotContext,
  ProviderModernModelPolicyContext,
  ProviderNormalizeConfigContext,
  ProviderNormalizeToolSchemasContext,
  ProviderNormalizeTransportContext,
  ProviderResolveConfigApiKeyContext,
  ProviderNormalizeModelIdContext,
  ProviderNormalizeResolvedModelContext,
  ProviderPrepareDynamicModelContext,
  ProviderPrepareExtraParamsContext,
  ProviderPrepareRuntimeAuthContext,
  ProviderPreparedRuntimeAuth,
  ProviderReasoningOutputMode,
  ProviderReasoningOutputModeContext,
  ProviderReplayPolicy,
  ProviderReplayPolicyContext,
  ProviderReplaySessionEntry,
  ProviderReplaySessionState,
  RealtimeTranscriptionProviderPlugin,
  ProviderResolvedUsageAuth,
  ProviderResolveDynamicModelContext,
  ProviderResolveTransportTurnStateContext,
  ProviderResolveWebSocketSessionPolicyContext,
  ProviderSanitizeReplayHistoryContext,
  ProviderTransportTurnState,
  ProviderToolSchemaDiagnostic,
  ProviderResolveUsageAuthContext,
  ProviderThinkingLevel,
  ProviderThinkingLevelId,
  ProviderThinkingPolicyContext,
  ProviderThinkingProfile,
  ProviderValidateReplayTurnsContext,
  ProviderWebSocketSessionPolicy,
  ProviderWrapStreamFnContext,
  SpeechProviderPlugin,
  PluginCommandContext,
  PluginCommandResult,
  PluginConversationBinding,
  PluginConversationBindingResolvedEvent,
  PluginConversationBindingResolutionDecision,
  PluginHookInboundClaimContext,
  PluginHookInboundClaimEvent,
} from "../plugins/types.js";
import { createCachedLazyValueGetter } from "./lazy-value.js";

export type {
  AnyAgentTool,
  AgentHarness,
  MediaUnderstandingProviderPlugin,
  EnclawedPluginApi,
  EnclawedPluginNodeHostCommand,
  EnclawedPluginReloadRegistration,
  EnclawedPluginSecurityAuditCollector,
  EnclawedPluginSecurityAuditContext,
  EnclawedPluginToolContext,
  EnclawedPluginToolFactory,
  PluginCommandContext,
  EnclawedPluginConfigSchema,
  ProviderDiscoveryContext,
  ProviderCatalogContext,
  ProviderCatalogResult,
  ProviderDeferSyntheticProfileAuthContext,
  ProviderAugmentModelCatalogContext,
  ProviderApplyConfigDefaultsContext,
  ProviderBuiltInModelSuppressionContext,
  ProviderBuiltInModelSuppressionResult,
  ProviderBuildMissingAuthMessageContext,
  ProviderBuildUnknownModelHintContext,
  ProviderCacheTtlEligibilityContext,
  ProviderDefaultThinkingPolicyContext,
  ProviderFetchUsageSnapshotContext,
  ProviderFailoverErrorContext,
  ProviderModernModelPolicyContext,
  ProviderNormalizeConfigContext,
  ProviderNormalizeToolSchemasContext,
  ProviderNormalizeTransportContext,
  ProviderResolveConfigApiKeyContext,
  ProviderNormalizeModelIdContext,
  ProviderReplayPolicy,
  ProviderReplayPolicyContext,
  ProviderReplaySessionEntry,
  ProviderReplaySessionState,
  ProviderPreparedRuntimeAuth,
  ProviderReasoningOutputMode,
  ProviderReasoningOutputModeContext,
  ProviderResolvedUsageAuth,
  ProviderToolSchemaDiagnostic,
  ProviderPrepareExtraParamsContext,
  ProviderPrepareDynamicModelContext,
  ProviderPrepareRuntimeAuthContext,
  ProviderSanitizeReplayHistoryContext,
  ProviderResolveUsageAuthContext,
  ProviderResolveDynamicModelContext,
  ProviderResolveTransportTurnStateContext,
  ProviderResolveWebSocketSessionPolicyContext,
  ProviderNormalizeResolvedModelContext,
  RealtimeTranscriptionProviderPlugin,
  ProviderTransportTurnState,
  SpeechProviderPlugin,
  ProviderThinkingLevel,
  ProviderThinkingLevelId,
  ProviderThinkingPolicyContext,
  ProviderThinkingProfile,
  ProviderValidateReplayTurnsContext,
  ProviderWebSocketSessionPolicy,
  ProviderWrapStreamFnContext,
  EnclawedGatewayDiscoveryAdvertiseContext,
  EnclawedGatewayDiscoveryService,
  EnclawedPluginNodeInvokeApprovalDecision,
  EnclawedPluginNodeInvokePolicy,
  EnclawedPluginNodeInvokePolicyApprovalRuntime,
  EnclawedPluginNodeInvokePolicyContext,
  EnclawedPluginNodeInvokePolicyResult,
  EnclawedPluginNodeInvokeTransportResult,
  MigrationApplyResult,
  MigrationDetection,
  MigrationItem,
  MigrationItemAction,
  MigrationItemKind,
  MigrationItemStatus,
  MigrationPlan,
  MigrationProviderContext,
  MigrationProviderPlugin,
  MigrationSummary,
  EnclawedPluginService,
  EnclawedPluginServiceContext,
  ProviderAuthContext,
  ProviderAuthDoctorHintContext,
  ProviderAuthMethodNonInteractiveContext,
  ProviderAuthMethod,
  ProviderAuthResult,
  EnclawedPluginCommandDefinition,
  EnclawedPluginDefinition,
  EnclawedPluginHttpRouteHandler,
  PluginLogger,
  PluginCommandResult,
  PluginConversationBinding,
  PluginConversationBindingResolvedEvent,
  PluginConversationBindingResolutionDecision,
  PluginHookInboundClaimContext,
  PluginHookInboundClaimEvent,
};
export type { ProviderRuntimeModel } from "../plugins/provider-runtime-model.types.js";
export type { EnclawedConfig };

export { buildPluginConfigSchema, emptyPluginConfigSchema } from "../plugins/config-schema.js";

/** Options for a plugin entry that registers providers, tools, commands, or services. */
type DefinePluginEntryOptions = {
  id: string;
  name: string;
  description: string;
  kind?: EnclawedPluginDefinition["kind"];
  configSchema?: EnclawedPluginConfigSchema | (() => EnclawedPluginConfigSchema);
  reload?: EnclawedPluginDefinition["reload"];
  nodeHostCommands?: EnclawedPluginDefinition["nodeHostCommands"];
  securityAuditCollectors?: EnclawedPluginDefinition["securityAuditCollectors"];
  register: (api: EnclawedPluginApi) => void;
};

/** Normalized object shape that Enclawed loads from a plugin entry module. */
type DefinedPluginEntry = {
  id: string;
  name: string;
  description: string;
  configSchema: EnclawedPluginConfigSchema;
  register: NonNullable<EnclawedPluginDefinition["register"]>;
} & Pick<
  EnclawedPluginDefinition,
  "kind" | "reload" | "nodeHostCommands" | "securityAuditCollectors"
>;

/**
 * Canonical entry helper for non-channel plugins.
 *
 * Use this for provider, tool, command, service, memory, and context-engine
 * plugins. Channel plugins should use `defineChannelPluginEntry(...)` from
 * `@enclawed/plugin-sdk/core` so they inherit the channel capability wiring.
 */
export function definePluginEntry({
  id,
  name,
  description,
  kind,
  configSchema = emptyPluginConfigSchema,
  reload,
  nodeHostCommands,
  securityAuditCollectors,
  register,
}: DefinePluginEntryOptions): DefinedPluginEntry {
  const getConfigSchema = createCachedLazyValueGetter(configSchema);
  return {
    id,
    name,
    description,
    ...(kind ? { kind } : {}),
    ...(reload ? { reload } : {}),
    ...(nodeHostCommands ? { nodeHostCommands } : {}),
    ...(securityAuditCollectors ? { securityAuditCollectors } : {}),
    get configSchema() {
      return getConfigSchema();
    },
    register,
  };
}
