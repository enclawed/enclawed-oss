import AjvPkg, { type ErrorObject } from "ajv";
import type { SessionsPatchResult } from "../session-utils.types.js";
import { type AgentEvent, AgentEventSchema, type AgentIdentityParams, AgentIdentityParamsSchema, type AgentIdentityResult, AgentIdentityResultSchema, AgentParamsSchema, MessageActionParamsSchema, type AgentSummary, AgentSummarySchema, type AgentsFileEntry, AgentsFileEntrySchema, type AgentsCreateParams, AgentsCreateParamsSchema, type AgentsCreateResult, AgentsCreateResultSchema, type AgentsUpdateParams, AgentsUpdateParamsSchema, type AgentsUpdateResult, AgentsUpdateResultSchema, type AgentsDeleteParams, AgentsDeleteParamsSchema, type AgentsDeleteResult, AgentsDeleteResultSchema, type AgentsFilesGetParams, AgentsFilesGetParamsSchema, type AgentsFilesGetResult, AgentsFilesGetResultSchema, type AgentsFilesListParams, AgentsFilesListParamsSchema, type AgentsFilesListResult, AgentsFilesListResultSchema, type AgentsFilesSetParams, AgentsFilesSetParamsSchema, type AgentsFilesSetResult, AgentsFilesSetResultSchema, type AgentsListParams, AgentsListParamsSchema, type AgentsListResult, AgentsListResultSchema, type AgentWaitParams, type ChannelsLogoutParams, ChannelsLogoutParamsSchema, type TalkConfigParams, TalkConfigParamsSchema, type TalkConfigResult, TalkConfigResultSchema, type TalkSpeakParams, TalkSpeakParamsSchema, type TalkSpeakResult, TalkSpeakResultSchema, type ChannelsStatusParams, ChannelsStatusParamsSchema, type ChannelsStatusResult, ChannelsStatusResultSchema, type CommandEntry, type CommandsListParams, CommandsListParamsSchema, type CommandsListResult, CommandsListResultSchema, type ChatEvent, ChatEventSchema, ChatHistoryParamsSchema, type ChatInjectParams, ChatInjectParamsSchema, ChatSendParamsSchema, type ConfigApplyParams, ConfigApplyParamsSchema, type ConfigGetParams, ConfigGetParamsSchema, type ConfigPatchParams, ConfigPatchParamsSchema, ConfigSchemaLookupParamsSchema, ConfigSchemaLookupResultSchema, type ConfigSchemaParams, ConfigSchemaParamsSchema, type ConfigSchemaResponse, ConfigSchemaResponseSchema, type ConfigSetParams, ConfigSetParamsSchema, type ConnectParams, ConnectParamsSchema, type CronAddParams, CronAddParamsSchema, type CronJob, CronJobSchema, type CronListParams, CronListParamsSchema, type CronRemoveParams, CronRemoveParamsSchema, type CronRunLogEntry, type CronRunParams, CronRunParamsSchema, type CronRunsParams, CronRunsParamsSchema, type CronStatusParams, CronStatusParamsSchema, type CronUpdateParams, CronUpdateParamsSchema, type DevicePairApproveParams, type DevicePairListParams, type DevicePairRejectParams, type ExecApprovalsGetParams, ExecApprovalsGetParamsSchema, type ExecApprovalsSetParams, ExecApprovalsSetParamsSchema, type ExecApprovalsSnapshot, type ExecApprovalGetParams, ExecApprovalGetParamsSchema, type ExecApprovalRequestParams, ExecApprovalRequestParamsSchema, type ExecApprovalResolveParams, ExecApprovalResolveParamsSchema, ErrorCodes, type ErrorShape, ErrorShapeSchema, type EventFrame, EventFrameSchema, errorShape, type GatewayFrame, GatewayFrameSchema, type HelloOk, HelloOkSchema, type LogsTailParams, LogsTailParamsSchema, type LogsTailResult, LogsTailResultSchema, ModelsListParamsSchema, type NodeEventParams, type NodePendingDrainParams, NodePendingDrainParamsSchema, type NodePendingDrainResult, NodePendingDrainResultSchema, type NodePendingEnqueueParams, NodePendingEnqueueParamsSchema, type NodePendingEnqueueResult, NodePendingEnqueueResultSchema, type NodeInvokeParams, NodeInvokeParamsSchema, type NodeInvokeResultParams, type NodeListParams, NodeListParamsSchema, NodePendingAckParamsSchema, type NodePairApproveParams, NodePairApproveParamsSchema, type NodePairListParams, NodePairListParamsSchema, type NodePairRejectParams, NodePairRejectParamsSchema, type NodePairRequestParams, NodePairRequestParamsSchema, type NodePairVerifyParams, NodePairVerifyParamsSchema, type PollParams, PollParamsSchema, PROTOCOL_VERSION, PushTestParamsSchema, PushTestResultSchema, type PresenceEntry, PresenceEntrySchema, ProtocolSchemas, type RequestFrame, RequestFrameSchema, type ResponseFrame, ResponseFrameSchema, SendParamsSchema, SessionsAbortParamsSchema, type SessionsCompactParams, SessionsCompactParamsSchema, SessionsCompactionBranchParamsSchema, SessionsCompactionGetParamsSchema, SessionsCompactionListParamsSchema, SessionsCompactionRestoreParamsSchema, SessionsCreateParamsSchema, type SessionsDeleteParams, SessionsDeleteParamsSchema, type SessionsListParams, SessionsListParamsSchema, type SessionsPatchParams, SessionsPatchParamsSchema, type SessionsPreviewParams, SessionsPreviewParamsSchema, type SessionsResetParams, SessionsResetParamsSchema, type SessionsResolveParams, SessionsResolveParamsSchema, SessionsSendParamsSchema, type SessionsUsageParams, SessionsUsageParamsSchema, type ShutdownEvent, ShutdownEventSchema, type SkillsBinsParams, type SkillsBinsResult, type SkillsDetailParams, SkillsDetailParamsSchema, type SkillsDetailResult, SkillsDetailResultSchema, type SkillsInstallParams, SkillsInstallParamsSchema, type SkillsSearchParams, SkillsSearchParamsSchema, type SkillsSearchResult, SkillsSearchResultSchema, type SkillsStatusParams, SkillsStatusParamsSchema, type SkillsUpdateParams, SkillsUpdateParamsSchema, type ToolsCatalogParams, ToolsCatalogParamsSchema, type ToolsCatalogResult, type ToolsEffectiveParams, ToolsEffectiveParamsSchema, type ToolsEffectiveResult, type Snapshot, SnapshotSchema, type StateVersion, StateVersionSchema, type TalkModeParams, type TickEvent, TickEventSchema, type UpdateRunParams, UpdateRunParamsSchema, type WakeParams, WakeParamsSchema, type WebLoginStartParams, WebLoginStartParamsSchema, type WebLoginWaitParams, WebLoginWaitParamsSchema, type WizardCancelParams, WizardCancelParamsSchema, type WizardNextParams, WizardNextParamsSchema, type WizardNextResult, WizardNextResultSchema, type WizardStartParams, WizardStartParamsSchema, type WizardStartResult, WizardStartResultSchema, type WizardStatusParams, WizardStatusParamsSchema, type WizardStatusResult, WizardStatusResultSchema, type WizardStep, WizardStepSchema } from "./schema.js";
export declare const validateCommandsListParams: AjvPkg.ValidateFunction<{
    provider?: string | undefined;
    scope?: "text" | "native" | "both" | undefined;
    agentId?: string | undefined;
    includeArgs?: boolean | undefined;
}>;
export declare const validateConnectParams: AjvPkg.ValidateFunction<{
    device?: {
        id: string;
        signature: string;
        publicKey: string;
        signedAt: number;
        nonce: string;
    } | undefined;
    auth?: {
        token?: string | undefined;
        password?: string | undefined;
        bootstrapToken?: string | undefined;
        deviceToken?: string | undefined;
    } | undefined;
    role?: string | undefined;
    permissions?: {
        [x: string]: boolean;
    } | undefined;
    commands?: string[] | undefined;
    scopes?: string[] | undefined;
    caps?: string[] | undefined;
    pathEnv?: string | undefined;
    locale?: string | undefined;
    userAgent?: string | undefined;
    minProtocol: number;
    maxProtocol: number;
    client: {
        displayName?: string | undefined;
        deviceFamily?: string | undefined;
        modelIdentifier?: string | undefined;
        instanceId?: string | undefined;
        id: "webchat" | "cli" | "webchat-ui" | "enclawed-control-ui" | "enclawed-tui" | "gateway-client" | "enclawed-macos" | "enclawed-ios" | "enclawed-android" | "node-host" | "test" | "fingerprint" | "enclawed-probe";
        version: string;
        mode: "webchat" | "cli" | "test" | "ui" | "backend" | "node" | "probe";
        platform: string;
    };
}>;
export declare const validateRequestFrame: AjvPkg.ValidateFunction<{
    params?: unknown;
    id: string;
    type: "req";
    method: string;
}>;
export declare const validateResponseFrame: AjvPkg.ValidateFunction<{
    error?: {
        details?: unknown;
        retryable?: boolean | undefined;
        retryAfterMs?: number | undefined;
        code: string;
        message: string;
    } | undefined;
    payload?: unknown;
    ok: boolean;
    id: string;
    type: "res";
}>;
export declare const validateEventFrame: AjvPkg.ValidateFunction<{
    seq?: number | undefined;
    payload?: unknown;
    stateVersion?: {
        presence: number;
        health: number;
    } | undefined;
    type: "event";
    event: string;
}>;
export declare const validateMessageActionParams: AjvPkg.ValidateFunction<{
    sessionId?: string | undefined;
    accountId?: string | undefined;
    requesterSenderId?: string | undefined;
    senderIsOwner?: boolean | undefined;
    sessionKey?: string | undefined;
    agentId?: string | undefined;
    toolContext?: {
        currentChannelId?: string | undefined;
        currentGraphChannelId?: string | undefined;
        currentChannelProvider?: string | undefined;
        currentThreadTs?: string | undefined;
        currentMessageId?: string | number | undefined;
        replyToMode?: "off" | "first" | "all" | "batched" | undefined;
        hasRepliedRef?: {
            value: boolean;
        } | undefined;
        skipCrossContextDecoration?: boolean | undefined;
    } | undefined;
    params: {
        [x: string]: unknown;
    };
    action: string;
    channel: string;
    idempotencyKey: string;
}>;
export declare const validateSendParams: AjvPkg.ValidateFunction<{
    to: any;
    idempotencyKey: any;
} & {
    to: any;
} & {
    idempotencyKey: any;
}>;
export declare const validatePollParams: AjvPkg.ValidateFunction<{
    silent?: boolean | undefined;
    channel?: string | undefined;
    accountId?: string | undefined;
    threadId?: string | undefined;
    maxSelections?: number | undefined;
    durationSeconds?: number | undefined;
    durationHours?: number | undefined;
    isAnonymous?: boolean | undefined;
    to: string;
    idempotencyKey: string;
    question: string;
    options: string[];
}>;
export declare const validateAgentParams: AjvPkg.ValidateFunction<{
    message: any;
    idempotencyKey: any;
} & {
    message: any;
} & {
    idempotencyKey: any;
}>;
export declare const validateAgentIdentityParams: AjvPkg.ValidateFunction<{
    sessionKey?: string | undefined;
    agentId?: string | undefined;
}>;
export declare const validateAgentWaitParams: AjvPkg.ValidateFunction<{
    timeoutMs?: number | undefined;
    runId: string;
}>;
export declare const validateWakeParams: AjvPkg.ValidateFunction<{
    text: string;
    mode: "now" | "next-heartbeat";
}>;
export declare const validateAgentsListParams: AjvPkg.ValidateFunction<{}>;
export declare const validateAgentsCreateParams: AjvPkg.ValidateFunction<{
    emoji?: string | undefined;
    avatar?: string | undefined;
    model?: string | undefined;
    name: string;
    workspace: string;
}>;
export declare const validateAgentsUpdateParams: AjvPkg.ValidateFunction<{
    name?: string | undefined;
    emoji?: string | undefined;
    avatar?: string | undefined;
    workspace?: string | undefined;
    model?: string | undefined;
    agentId: string;
}>;
export declare const validateAgentsDeleteParams: AjvPkg.ValidateFunction<{
    deleteFiles?: boolean | undefined;
    agentId: string;
}>;
export declare const validateAgentsFilesListParams: AjvPkg.ValidateFunction<{
    agentId: string;
}>;
export declare const validateAgentsFilesGetParams: AjvPkg.ValidateFunction<{
    name: string;
    agentId: string;
}>;
export declare const validateAgentsFilesSetParams: AjvPkg.ValidateFunction<{
    name: string;
    agentId: string;
    content: string;
}>;
export declare const validateNodePairRequestParams: AjvPkg.ValidateFunction<{
    version?: string | undefined;
    silent?: boolean | undefined;
    displayName?: string | undefined;
    commands?: string[] | undefined;
    platform?: string | undefined;
    deviceFamily?: string | undefined;
    remoteIp?: string | undefined;
    modelIdentifier?: string | undefined;
    caps?: string[] | undefined;
    coreVersion?: string | undefined;
    uiVersion?: string | undefined;
    nodeId: string;
}>;
export declare const validateNodePairListParams: AjvPkg.ValidateFunction<{}>;
export declare const validateNodePairApproveParams: AjvPkg.ValidateFunction<{
    requestId: string;
}>;
export declare const validateNodePairRejectParams: AjvPkg.ValidateFunction<{
    requestId: string;
}>;
export declare const validateNodePairVerifyParams: AjvPkg.ValidateFunction<{
    token: string;
    nodeId: string;
}>;
export declare const validateNodeRenameParams: AjvPkg.ValidateFunction<{
    displayName: string;
    nodeId: string;
}>;
export declare const validateNodeListParams: AjvPkg.ValidateFunction<{}>;
export declare const validateNodePendingAckParams: AjvPkg.ValidateFunction<{
    ids: string[];
}>;
export declare const validateNodeDescribeParams: AjvPkg.ValidateFunction<{
    nodeId: string;
}>;
export declare const validateNodeInvokeParams: AjvPkg.ValidateFunction<{
    params?: unknown;
    timeoutMs?: number | undefined;
    command: string;
    idempotencyKey: string;
    nodeId: string;
}>;
export declare const validateNodeInvokeResultParams: AjvPkg.ValidateFunction<{
    error?: {
        code?: string | undefined;
        message?: string | undefined;
    } | undefined;
    payload?: unknown;
    payloadJSON?: string | undefined;
    ok: boolean;
    id: string;
    nodeId: string;
}>;
export declare const validateNodeEventParams: AjvPkg.ValidateFunction<{
    payload?: unknown;
    payloadJSON?: string | undefined;
    event: string;
}>;
export declare const validateNodePendingDrainParams: AjvPkg.ValidateFunction<{
    maxItems?: number | undefined;
}>;
export declare const validateNodePendingEnqueueParams: AjvPkg.ValidateFunction<{
    priority?: string | undefined;
    expiresInMs?: number | undefined;
    wake?: boolean | undefined;
    type: string;
    nodeId: string;
}>;
export declare const validatePushTestParams: AjvPkg.ValidateFunction<{
    title?: string | undefined;
    body?: string | undefined;
    environment?: string | undefined;
    nodeId: string;
}>;
export declare const validateSecretsResolveParams: AjvPkg.ValidateFunction<{
    commandName: string;
    targetIds: string[];
}>;
export declare const validateSecretsResolveResult: AjvPkg.ValidateFunction<{
    ok?: boolean | undefined;
    assignments?: {
        path?: string | undefined;
        value: unknown;
        pathSegments: string[];
    }[] | undefined;
    diagnostics?: string[] | undefined;
    inactiveRefPaths?: string[] | undefined;
}>;
export declare const validateSessionsListParams: AjvPkg.ValidateFunction<{
    search?: string | undefined;
    label?: string | undefined;
    spawnedBy?: string | undefined;
    agentId?: string | undefined;
    limit?: number | undefined;
    activeMinutes?: number | undefined;
    includeGlobal?: boolean | undefined;
    includeUnknown?: boolean | undefined;
    includeDerivedTitles?: boolean | undefined;
    includeLastMessage?: boolean | undefined;
}>;
export declare const validateSessionsPreviewParams: AjvPkg.ValidateFunction<{
    maxChars?: number | undefined;
    limit?: number | undefined;
    keys: string[];
}>;
export declare const validateSessionsResolveParams: AjvPkg.ValidateFunction<{
    sessionId?: string | undefined;
    key?: string | undefined;
    label?: string | undefined;
    spawnedBy?: string | undefined;
    agentId?: string | undefined;
    includeGlobal?: boolean | undefined;
    includeUnknown?: boolean | undefined;
}>;
export declare const validateSessionsCreateParams: AjvPkg.ValidateFunction<{
    message?: string | undefined;
    key?: string | undefined;
    model?: string | undefined;
    label?: string | undefined;
    parentSessionKey?: string | undefined;
    agentId?: string | undefined;
    task?: string | undefined;
}>;
export declare const validateSessionsSendParams: AjvPkg.ValidateFunction<{
    timeoutMs?: number | undefined;
    thinking?: string | undefined;
    attachments?: unknown[] | undefined;
    idempotencyKey?: string | undefined;
    message: string;
    key: string;
}>;
export declare const validateSessionsMessagesSubscribeParams: AjvPkg.ValidateFunction<{
    key: string;
}>;
export declare const validateSessionsMessagesUnsubscribeParams: AjvPkg.ValidateFunction<{
    key: string;
}>;
export declare const validateSessionsAbortParams: AjvPkg.ValidateFunction<{
    runId?: string | undefined;
    key: string;
}>;
export declare const validateSessionsPatchParams: AjvPkg.ValidateFunction<{
    model?: string | null | undefined;
    label?: string | null | undefined;
    spawnedBy?: string | null | undefined;
    spawnedWorkspaceDir?: string | null | undefined;
    spawnDepth?: number | null | undefined;
    subagentRole?: "orchestrator" | "leaf" | null | undefined;
    subagentControlScope?: "none" | "children" | null | undefined;
    thinkingLevel?: string | null | undefined;
    fastMode?: boolean | null | undefined;
    verboseLevel?: string | null | undefined;
    traceLevel?: string | null | undefined;
    reasoningLevel?: string | null | undefined;
    elevatedLevel?: string | null | undefined;
    execHost?: string | null | undefined;
    execSecurity?: string | null | undefined;
    execAsk?: string | null | undefined;
    execNode?: string | null | undefined;
    responseUsage?: "off" | "full" | "tokens" | "on" | null | undefined;
    groupActivation?: "always" | "mention" | null | undefined;
    sendPolicy?: "allow" | "deny" | null | undefined;
    key: string;
}>;
export declare const validateSessionsResetParams: AjvPkg.ValidateFunction<{
    reason?: "new" | "reset" | undefined;
    key: string;
}>;
export declare const validateSessionsDeleteParams: AjvPkg.ValidateFunction<{
    deleteTranscript?: boolean | undefined;
    emitLifecycleHooks?: boolean | undefined;
    key: string;
}>;
export declare const validateSessionsCompactParams: AjvPkg.ValidateFunction<{
    maxLines?: number | undefined;
    key: string;
}>;
export declare const validateSessionsCompactionListParams: AjvPkg.ValidateFunction<{
    key: string;
}>;
export declare const validateSessionsCompactionGetParams: AjvPkg.ValidateFunction<{
    key: string;
    checkpointId: string;
}>;
export declare const validateSessionsCompactionBranchParams: AjvPkg.ValidateFunction<{
    key: string;
    checkpointId: string;
}>;
export declare const validateSessionsCompactionRestoreParams: AjvPkg.ValidateFunction<{
    key: string;
    checkpointId: string;
}>;
export declare const validateSessionsUsageParams: AjvPkg.ValidateFunction<{
    mode?: "gateway" | "utc" | "specific" | undefined;
    key?: string | undefined;
    limit?: number | undefined;
    startDate?: string | undefined;
    endDate?: string | undefined;
    utcOffset?: string | undefined;
    includeContextWeight?: boolean | undefined;
}>;
export declare const validateConfigGetParams: AjvPkg.ValidateFunction<{}>;
export declare const validateConfigSetParams: AjvPkg.ValidateFunction<{
    baseHash?: string | undefined;
    raw: string;
}>;
export declare const validateConfigApplyParams: AjvPkg.ValidateFunction<{
    deliveryContext?: {
        channel?: string | undefined;
        to?: string | undefined;
        accountId?: string | undefined;
        threadId?: string | number | undefined;
    } | undefined;
    sessionKey?: string | undefined;
    baseHash?: string | undefined;
    note?: string | undefined;
    restartDelayMs?: number | undefined;
    raw: string;
}>;
export declare const validateConfigPatchParams: AjvPkg.ValidateFunction<{
    deliveryContext?: {
        channel?: string | undefined;
        to?: string | undefined;
        accountId?: string | undefined;
        threadId?: string | number | undefined;
    } | undefined;
    sessionKey?: string | undefined;
    baseHash?: string | undefined;
    note?: string | undefined;
    restartDelayMs?: number | undefined;
    raw: string;
}>;
export declare const validateConfigSchemaParams: AjvPkg.ValidateFunction<{}>;
export declare const validateConfigSchemaLookupParams: AjvPkg.ValidateFunction<{
    path: string;
}>;
export declare const validateConfigSchemaLookupResult: AjvPkg.ValidateFunction<{
    hint?: {
        sensitive?: boolean | undefined;
        group?: string | undefined;
        label?: string | undefined;
        order?: number | undefined;
        tags?: string[] | undefined;
        help?: string | undefined;
        advanced?: boolean | undefined;
        placeholder?: string | undefined;
        itemTemplate?: unknown;
    } | undefined;
    hintPath?: string | undefined;
    schema: unknown;
    path: string;
    children: {
        type?: string | string[] | undefined;
        hint?: {
            sensitive?: boolean | undefined;
            group?: string | undefined;
            label?: string | undefined;
            order?: number | undefined;
            tags?: string[] | undefined;
            help?: string | undefined;
            advanced?: boolean | undefined;
            placeholder?: string | undefined;
            itemTemplate?: unknown;
        } | undefined;
        hintPath?: string | undefined;
        path: string;
        key: string;
        required: boolean;
        hasChildren: boolean;
    }[];
}>;
export declare const validateWizardStartParams: AjvPkg.ValidateFunction<{
    mode?: "local" | "remote" | undefined;
    workspace?: string | undefined;
}>;
export declare const validateWizardNextParams: AjvPkg.ValidateFunction<{
    answer?: {
        value?: unknown;
        stepId: string;
    } | undefined;
    sessionId: string;
}>;
export declare const validateWizardCancelParams: AjvPkg.ValidateFunction<{
    sessionId: string;
}>;
export declare const validateWizardStatusParams: AjvPkg.ValidateFunction<{
    sessionId: string;
}>;
export declare const validateTalkModeParams: AjvPkg.ValidateFunction<{
    phase?: string | undefined;
    enabled: boolean;
}>;
export declare const validateTalkConfigParams: AjvPkg.ValidateFunction<{
    includeSecrets?: boolean | undefined;
}>;
export declare const validateTalkConfigResult: AjvPkg.ValidateFunction<{
    config: {
        ui?: {
            seamColor?: string | undefined;
        } | undefined;
        talk?: {
            providers?: {
                [x: string]: {
                    apiKey?: string | {
                        source: "env";
                        id: string;
                        provider: string;
                    } | {
                        source: "file";
                        id: string;
                        provider: string;
                    } | {
                        source: "exec";
                        id: string;
                        provider: string;
                    } | undefined;
                };
            } | undefined;
            provider?: string | undefined;
            interruptOnSpeech?: boolean | undefined;
            silenceTimeoutMs?: number | undefined;
            resolved: {
                config: {
                    apiKey?: string | {
                        source: "env";
                        id: string;
                        provider: string;
                    } | {
                        source: "file";
                        id: string;
                        provider: string;
                    } | {
                        source: "exec";
                        id: string;
                        provider: string;
                    } | undefined;
                };
                provider: string;
            };
        } | undefined;
        session?: {
            mainKey?: string | undefined;
        } | undefined;
    };
}>;
export declare const validateTalkSpeakParams: AjvPkg.ValidateFunction<{
    normalize?: string | undefined;
    style?: number | undefined;
    language?: string | undefined;
    voiceId?: string | undefined;
    modelId?: string | undefined;
    outputFormat?: string | undefined;
    speed?: number | undefined;
    rateWpm?: number | undefined;
    stability?: number | undefined;
    similarity?: number | undefined;
    speakerBoost?: boolean | undefined;
    seed?: number | undefined;
    latencyTier?: number | undefined;
    text: string;
}>;
export declare const validateTalkSpeakResult: AjvPkg.ValidateFunction<{
    outputFormat?: string | undefined;
    voiceCompatible?: boolean | undefined;
    mimeType?: string | undefined;
    fileExtension?: string | undefined;
    provider: string;
    audioBase64: string;
}>;
export declare const validateChannelsStatusParams: AjvPkg.ValidateFunction<{
    timeoutMs?: number | undefined;
    probe?: boolean | undefined;
}>;
export declare const validateChannelsLogoutParams: AjvPkg.ValidateFunction<{
    accountId?: string | undefined;
    channel: string;
}>;
export declare const validateModelsListParams: AjvPkg.ValidateFunction<{}>;
export declare const validateSkillsStatusParams: AjvPkg.ValidateFunction<{
    agentId?: string | undefined;
}>;
export declare const validateToolsCatalogParams: AjvPkg.ValidateFunction<{
    agentId?: string | undefined;
    includePlugins?: boolean | undefined;
}>;
export declare const validateToolsEffectiveParams: AjvPkg.ValidateFunction<{
    agentId?: string | undefined;
    sessionKey: string;
}>;
export declare const validateSkillsBinsParams: AjvPkg.ValidateFunction<{}>;
export declare const validateSkillsInstallParams: AjvPkg.ValidateFunction<{
    timeoutMs?: number | undefined;
    dangerouslyForceUnsafeInstall?: boolean | undefined;
    name: string;
    installId: string;
} | {
    version?: string | undefined;
    force?: boolean | undefined;
    timeoutMs?: number | undefined;
    source: "clawhub";
    slug: string;
}>;
export declare const validateSkillsUpdateParams: AjvPkg.ValidateFunction<{
    enabled?: boolean | undefined;
    env?: {
        [x: string]: string;
    } | undefined;
    apiKey?: string | undefined;
    skillKey: string;
} | {
    all?: boolean | undefined;
    slug?: string | undefined;
    source: "clawhub";
}>;
export declare const validateSkillsSearchParams: AjvPkg.ValidateFunction<{
    query?: string | undefined;
    limit?: number | undefined;
}>;
export declare const validateSkillsDetailParams: AjvPkg.ValidateFunction<{
    slug: string;
}>;
export declare const validateCronListParams: AjvPkg.ValidateFunction<{
    enabled?: "enabled" | "all" | "disabled" | undefined;
    query?: string | undefined;
    limit?: number | undefined;
    includeDisabled?: boolean | undefined;
    offset?: number | undefined;
    sortBy?: "name" | "updatedAtMs" | "nextRunAtMs" | undefined;
    sortDir?: "asc" | "desc" | undefined;
}>;
export declare const validateCronStatusParams: AjvPkg.ValidateFunction<{}>;
export declare const validateCronAddParams: AjvPkg.ValidateFunction<{
    enabled?: boolean | undefined;
    description?: string | undefined;
    sessionKey?: string | null | undefined;
    agentId?: string | null | undefined;
    deleteAfterRun?: boolean | undefined;
    delivery?: {
        channel?: string | undefined;
        to?: string | undefined;
        accountId?: string | undefined;
        bestEffort?: boolean | undefined;
        failureDestination?: {
            mode?: "announce" | "webhook" | undefined;
            channel?: string | undefined;
            to?: string | undefined;
            accountId?: string | undefined;
        } | undefined;
        mode: "none";
    } | {
        channel?: string | undefined;
        to?: string | undefined;
        accountId?: string | undefined;
        bestEffort?: boolean | undefined;
        failureDestination?: {
            mode?: "announce" | "webhook" | undefined;
            channel?: string | undefined;
            to?: string | undefined;
            accountId?: string | undefined;
        } | undefined;
        mode: "announce";
    } | {
        channel?: string | undefined;
        accountId?: string | undefined;
        bestEffort?: boolean | undefined;
        failureDestination?: {
            mode?: "announce" | "webhook" | undefined;
            channel?: string | undefined;
            to?: string | undefined;
            accountId?: string | undefined;
        } | undefined;
        mode: "webhook";
        to: string;
    } | undefined;
    failureAlert?: false | {
        mode?: "announce" | "webhook" | undefined;
        channel?: string | undefined;
        to?: string | undefined;
        accountId?: string | undefined;
        after?: number | undefined;
        cooldownMs?: number | undefined;
    } | undefined;
    name: string;
    schedule: {
        at: string;
        kind: "at";
    } | {
        anchorMs?: number | undefined;
        kind: "every";
        everyMs: number;
    } | {
        tz?: string | undefined;
        staggerMs?: number | undefined;
        kind: "cron";
        expr: string;
    };
    sessionTarget: string;
    wakeMode: "now" | "next-heartbeat";
    payload: {
        text: string;
        kind: "systemEvent";
    } | {
        thinking?: string | undefined;
        timeoutSeconds?: number | undefined;
        model?: string | undefined;
        fallbacks?: string[] | undefined;
        allowUnsafeExternalContent?: boolean | undefined;
        lightContext?: boolean | undefined;
        toolsAllow?: unknown;
        message: unknown;
        kind: "agentTurn";
    };
}>;
export declare const validateCronUpdateParams: AjvPkg.ValidateFunction<{
    id: string;
} | {
    jobId: string;
}>;
export declare const validateCronRemoveParams: AjvPkg.ValidateFunction<{
    id: string;
} | {
    jobId: string;
}>;
export declare const validateCronRunParams: AjvPkg.ValidateFunction<{
    id: string;
} | {
    jobId: string;
}>;
export declare const validateCronRunsParams: AjvPkg.ValidateFunction<{
    id?: string | undefined;
    scope?: "all" | "job" | undefined;
    status?: "ok" | "error" | "all" | "skipped" | undefined;
    query?: string | undefined;
    limit?: number | undefined;
    jobId?: string | undefined;
    offset?: number | undefined;
    sortDir?: "asc" | "desc" | undefined;
    statuses?: ("ok" | "error" | "skipped")[] | undefined;
    deliveryStatuses?: ("unknown" | "delivered" | "not-delivered" | "not-requested")[] | undefined;
    deliveryStatus?: "unknown" | "delivered" | "not-delivered" | "not-requested" | undefined;
}>;
export declare const validateDevicePairListParams: AjvPkg.ValidateFunction<{}>;
export declare const validateDevicePairApproveParams: AjvPkg.ValidateFunction<{
    requestId: string;
}>;
export declare const validateDevicePairRejectParams: AjvPkg.ValidateFunction<{
    requestId: string;
}>;
export declare const validateDevicePairRemoveParams: AjvPkg.ValidateFunction<{
    deviceId: string;
}>;
export declare const validateDeviceTokenRotateParams: AjvPkg.ValidateFunction<{
    scopes?: string[] | undefined;
    role: string;
    deviceId: string;
}>;
export declare const validateDeviceTokenRevokeParams: AjvPkg.ValidateFunction<{
    role: string;
    deviceId: string;
}>;
export declare const validateExecApprovalsGetParams: AjvPkg.ValidateFunction<{}>;
export declare const validateExecApprovalsSetParams: AjvPkg.ValidateFunction<{
    baseHash?: string | undefined;
    file: {
        defaults?: {
            security?: string | undefined;
            ask?: string | undefined;
            askFallback?: string | undefined;
            autoAllowSkills?: boolean | undefined;
        } | undefined;
        agents?: {
            [x: string]: {
                allowlist?: {
                    id?: string | undefined;
                    argPattern?: string | undefined;
                    lastUsedAt?: number | undefined;
                    lastUsedCommand?: string | undefined;
                    lastResolvedPath?: string | undefined;
                    pattern: string;
                }[] | undefined;
                security?: string | undefined;
                ask?: string | undefined;
                askFallback?: string | undefined;
                autoAllowSkills?: boolean | undefined;
            };
        } | undefined;
        socket?: {
            token?: string | undefined;
            path?: string | undefined;
        } | undefined;
        version: 1;
    };
}>;
export declare const validateExecApprovalGetParams: AjvPkg.ValidateFunction<{
    id: string;
}>;
export declare const validateExecApprovalRequestParams: AjvPkg.ValidateFunction<{
    id?: string | undefined;
    env?: {
        [x: string]: string;
    } | undefined;
    timeoutMs?: number | undefined;
    command?: string | undefined;
    sessionKey?: string | null | undefined;
    agentId?: string | null | undefined;
    security?: string | null | undefined;
    ask?: string | null | undefined;
    nodeId?: string | null | undefined;
    commandArgv?: string[] | undefined;
    systemRunPlan?: {
        commandPreview?: string | null | undefined;
        mutableFileOperand?: {
            sha256: string;
            path: string;
            argvIndex: number;
        } | null | undefined;
        sessionKey: string | null;
        agentId: string | null;
        argv: string[];
        cwd: string | null;
        commandText: string;
    } | undefined;
    cwd?: string | null | undefined;
    host?: string | null | undefined;
    resolvedPath?: string | null | undefined;
    turnSourceChannel?: string | null | undefined;
    turnSourceTo?: string | null | undefined;
    turnSourceAccountId?: string | null | undefined;
    turnSourceThreadId?: string | number | null | undefined;
    twoPhase?: boolean | undefined;
}>;
export declare const validateExecApprovalResolveParams: AjvPkg.ValidateFunction<{
    id: string;
    decision: string;
}>;
export declare const validatePluginApprovalRequestParams: AjvPkg.ValidateFunction<{
    timeoutMs?: number | undefined;
    sessionKey?: string | undefined;
    agentId?: string | undefined;
    pluginId?: string | undefined;
    turnSourceChannel?: string | undefined;
    turnSourceTo?: string | undefined;
    turnSourceAccountId?: string | undefined;
    turnSourceThreadId?: string | number | undefined;
    twoPhase?: boolean | undefined;
    severity?: string | undefined;
    toolName?: string | undefined;
    toolCallId?: string | undefined;
    description: string;
    title: string;
}>;
export declare const validatePluginApprovalResolveParams: AjvPkg.ValidateFunction<{
    id: string;
    decision: string;
}>;
export declare const validateExecApprovalsNodeGetParams: AjvPkg.ValidateFunction<{
    nodeId: string;
}>;
export declare const validateExecApprovalsNodeSetParams: AjvPkg.ValidateFunction<{
    baseHash?: string | undefined;
    file: {
        defaults?: {
            security?: string | undefined;
            ask?: string | undefined;
            askFallback?: string | undefined;
            autoAllowSkills?: boolean | undefined;
        } | undefined;
        agents?: {
            [x: string]: {
                allowlist?: {
                    id?: string | undefined;
                    argPattern?: string | undefined;
                    lastUsedAt?: number | undefined;
                    lastUsedCommand?: string | undefined;
                    lastResolvedPath?: string | undefined;
                    pattern: string;
                }[] | undefined;
                security?: string | undefined;
                ask?: string | undefined;
                askFallback?: string | undefined;
                autoAllowSkills?: boolean | undefined;
            };
        } | undefined;
        socket?: {
            token?: string | undefined;
            path?: string | undefined;
        } | undefined;
        version: 1;
    };
    nodeId: string;
}>;
export declare const validateLogsTailParams: AjvPkg.ValidateFunction<{
    maxBytes?: number | undefined;
    limit?: number | undefined;
    cursor?: number | undefined;
}>;
export declare const validateChatHistoryParams: AjvPkg.ValidateFunction<{
    sessionKey: any;
}>;
export declare const validateChatSendParams: AjvPkg.ValidateFunction<{
    message: any;
    idempotencyKey: any;
    sessionKey: any;
} & {
    message: any;
} & {
    idempotencyKey: any;
} & {
    sessionKey: any;
}>;
export declare const validateChatAbortParams: AjvPkg.ValidateFunction<{
    runId?: string | undefined;
    sessionKey: string;
}>;
export declare const validateChatInjectParams: AjvPkg.ValidateFunction<{
    label?: string | undefined;
    message: string;
    sessionKey: string;
}>;
export declare const validateChatEvent: AjvPkg.ValidateFunction<{
    seq: any;
    runId: any;
    sessionKey: any;
    state: any;
} & {
    seq: any;
} & {
    runId: any;
} & {
    sessionKey: any;
} & {
    state: any;
}>;
export declare const validateUpdateRunParams: AjvPkg.ValidateFunction<{
    timeoutMs?: number | undefined;
    deliveryContext?: {
        channel?: string | undefined;
        to?: string | undefined;
        accountId?: string | undefined;
        threadId?: string | number | undefined;
    } | undefined;
    sessionKey?: string | undefined;
    note?: string | undefined;
    restartDelayMs?: number | undefined;
}>;
export declare const validateWebLoginStartParams: AjvPkg.ValidateFunction<{
    force?: boolean | undefined;
    timeoutMs?: number | undefined;
    accountId?: string | undefined;
    verbose?: boolean | undefined;
}>;
export declare const validateWebLoginWaitParams: AjvPkg.ValidateFunction<{
    timeoutMs?: number | undefined;
    accountId?: string | undefined;
}>;
export declare function formatValidationErrors(errors: ErrorObject[] | null | undefined): string;
export { ConnectParamsSchema, HelloOkSchema, RequestFrameSchema, ResponseFrameSchema, EventFrameSchema, GatewayFrameSchema, PresenceEntrySchema, SnapshotSchema, ErrorShapeSchema, StateVersionSchema, AgentEventSchema, MessageActionParamsSchema, ChatEventSchema, SendParamsSchema, PollParamsSchema, AgentParamsSchema, AgentIdentityParamsSchema, AgentIdentityResultSchema, WakeParamsSchema, PushTestParamsSchema, PushTestResultSchema, NodePairRequestParamsSchema, NodePairListParamsSchema, NodePairApproveParamsSchema, NodePairRejectParamsSchema, NodePairVerifyParamsSchema, NodeListParamsSchema, NodePendingAckParamsSchema, NodeInvokeParamsSchema, NodePendingDrainParamsSchema, NodePendingDrainResultSchema, NodePendingEnqueueParamsSchema, NodePendingEnqueueResultSchema, SessionsListParamsSchema, SessionsPreviewParamsSchema, SessionsResolveParamsSchema, SessionsCompactionListParamsSchema, SessionsCompactionGetParamsSchema, SessionsCompactionBranchParamsSchema, SessionsCompactionRestoreParamsSchema, SessionsCreateParamsSchema, SessionsSendParamsSchema, SessionsAbortParamsSchema, SessionsPatchParamsSchema, SessionsResetParamsSchema, SessionsDeleteParamsSchema, SessionsCompactParamsSchema, SessionsUsageParamsSchema, ConfigGetParamsSchema, ConfigSetParamsSchema, ConfigApplyParamsSchema, ConfigPatchParamsSchema, ConfigSchemaParamsSchema, ConfigSchemaLookupParamsSchema, ConfigSchemaResponseSchema, ConfigSchemaLookupResultSchema, WizardStartParamsSchema, WizardNextParamsSchema, WizardCancelParamsSchema, WizardStatusParamsSchema, WizardStepSchema, WizardNextResultSchema, WizardStartResultSchema, WizardStatusResultSchema, TalkConfigParamsSchema, TalkConfigResultSchema, TalkSpeakParamsSchema, TalkSpeakResultSchema, ChannelsStatusParamsSchema, ChannelsStatusResultSchema, ChannelsLogoutParamsSchema, WebLoginStartParamsSchema, WebLoginWaitParamsSchema, AgentSummarySchema, AgentsFileEntrySchema, AgentsCreateParamsSchema, AgentsCreateResultSchema, AgentsUpdateParamsSchema, AgentsUpdateResultSchema, AgentsDeleteParamsSchema, AgentsDeleteResultSchema, AgentsFilesListParamsSchema, AgentsFilesListResultSchema, AgentsFilesGetParamsSchema, AgentsFilesGetResultSchema, AgentsFilesSetParamsSchema, AgentsFilesSetResultSchema, AgentsListParamsSchema, AgentsListResultSchema, CommandsListParamsSchema, CommandsListResultSchema, ModelsListParamsSchema, SkillsStatusParamsSchema, ToolsCatalogParamsSchema, ToolsEffectiveParamsSchema, SkillsInstallParamsSchema, SkillsSearchParamsSchema, SkillsSearchResultSchema, SkillsDetailParamsSchema, SkillsDetailResultSchema, SkillsUpdateParamsSchema, CronJobSchema, CronListParamsSchema, CronStatusParamsSchema, CronAddParamsSchema, CronUpdateParamsSchema, CronRemoveParamsSchema, CronRunParamsSchema, CronRunsParamsSchema, LogsTailParamsSchema, LogsTailResultSchema, ExecApprovalsGetParamsSchema, ExecApprovalsSetParamsSchema, ExecApprovalGetParamsSchema, ExecApprovalRequestParamsSchema, ExecApprovalResolveParamsSchema, ChatHistoryParamsSchema, ChatSendParamsSchema, ChatInjectParamsSchema, UpdateRunParamsSchema, TickEventSchema, ShutdownEventSchema, ProtocolSchemas, PROTOCOL_VERSION, ErrorCodes, errorShape, };
export type { GatewayFrame, ConnectParams, HelloOk, RequestFrame, ResponseFrame, EventFrame, PresenceEntry, Snapshot, ErrorShape, StateVersion, AgentEvent, AgentIdentityParams, AgentIdentityResult, AgentWaitParams, ChatEvent, TickEvent, ShutdownEvent, WakeParams, NodePairRequestParams, NodePairListParams, NodePairApproveParams, DevicePairListParams, DevicePairApproveParams, DevicePairRejectParams, ConfigGetParams, ConfigSetParams, ConfigApplyParams, ConfigPatchParams, ConfigSchemaParams, ConfigSchemaResponse, WizardStartParams, WizardNextParams, WizardCancelParams, WizardStatusParams, WizardStep, WizardNextResult, WizardStartResult, WizardStatusResult, TalkConfigParams, TalkConfigResult, TalkSpeakParams, TalkSpeakResult, TalkModeParams, ChannelsStatusParams, ChannelsStatusResult, ChannelsLogoutParams, WebLoginStartParams, WebLoginWaitParams, AgentSummary, AgentsFileEntry, AgentsCreateParams, AgentsCreateResult, AgentsUpdateParams, AgentsUpdateResult, AgentsDeleteParams, AgentsDeleteResult, AgentsFilesListParams, AgentsFilesListResult, AgentsFilesGetParams, AgentsFilesGetResult, AgentsFilesSetParams, AgentsFilesSetResult, AgentsListParams, AgentsListResult, CommandsListParams, CommandsListResult, CommandEntry, SkillsStatusParams, ToolsCatalogParams, ToolsCatalogResult, ToolsEffectiveParams, ToolsEffectiveResult, SkillsBinsParams, SkillsBinsResult, SkillsSearchParams, SkillsSearchResult, SkillsDetailParams, SkillsDetailResult, SkillsInstallParams, SkillsUpdateParams, NodePairRejectParams, NodePairVerifyParams, NodeListParams, NodeInvokeParams, NodeInvokeResultParams, NodeEventParams, NodePendingDrainParams, NodePendingDrainResult, NodePendingEnqueueParams, NodePendingEnqueueResult, SessionsListParams, SessionsPreviewParams, SessionsResolveParams, SessionsPatchParams, SessionsPatchResult, SessionsResetParams, SessionsDeleteParams, SessionsCompactParams, SessionsUsageParams, CronJob, CronListParams, CronStatusParams, CronAddParams, CronUpdateParams, CronRemoveParams, CronRunParams, CronRunsParams, CronRunLogEntry, ExecApprovalsGetParams, ExecApprovalsSetParams, ExecApprovalsSnapshot, ExecApprovalGetParams, ExecApprovalRequestParams, ExecApprovalResolveParams, LogsTailParams, LogsTailResult, PollParams, UpdateRunParams, ChatInjectParams, };
