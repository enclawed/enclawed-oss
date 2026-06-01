import type { DmPolicy } from "../../config/types.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { RuntimeEnv } from "../../runtime.js";
import type { WizardPrompter } from "../../wizard/prompts.js";
import type { ChannelAccessPolicy } from "./setup-group-access.js";
import type { ChannelConfigAdapter, ChannelSetupAdapter } from "./types.adapters.js";
import type { ChannelCapabilities, ChannelId, ChannelMeta, ChannelSetupInput } from "./types.core.js";
export type ChannelSetupPlugin = {
    id: ChannelId;
    meta: ChannelMeta;
    capabilities: ChannelCapabilities;
    config: ChannelConfigAdapter<unknown>;
    setup?: ChannelSetupAdapter;
    setupWizard?: ChannelSetupWizard | ChannelSetupWizardAdapter;
};
export type ChannelSetupWizardStatus = {
    configuredLabel: string;
    unconfiguredLabel: string;
    configuredHint?: string;
    unconfiguredHint?: string;
    configuredScore?: number;
    unconfiguredScore?: number;
    resolveConfigured: (params: {
        cfg: EnclawedConfig;
        accountId?: string;
    }) => boolean | Promise<boolean>;
    resolveStatusLines?: (params: {
        cfg: EnclawedConfig;
        accountId?: string;
        configured: boolean;
    }) => string[] | Promise<string[]>;
    resolveSelectionHint?: (params: {
        cfg: EnclawedConfig;
        accountId?: string;
        configured: boolean;
    }) => string | undefined | Promise<string | undefined>;
    resolveQuickstartScore?: (params: {
        cfg: EnclawedConfig;
        accountId?: string;
        configured: boolean;
    }) => number | undefined | Promise<number | undefined>;
};
export type ChannelSetupWizardCredentialState = {
    accountConfigured: boolean;
    hasConfiguredValue: boolean;
    resolvedValue?: string;
    envValue?: string;
};
export type ChannelSetupWizardCredentialValues = Partial<Record<string, string>>;
export type ChannelSetupWizardNote = {
    title: string;
    lines: string[];
    shouldShow?: (params: {
        cfg: EnclawedConfig;
        accountId: string;
        credentialValues: ChannelSetupWizardCredentialValues;
    }) => boolean | Promise<boolean>;
};
export type ChannelSetupWizardEnvShortcut = {
    prompt: string;
    preferredEnvVar?: string;
    isAvailable: (params: {
        cfg: EnclawedConfig;
        accountId: string;
    }) => boolean;
    apply: (params: {
        cfg: EnclawedConfig;
        accountId: string;
    }) => EnclawedConfig | Promise<EnclawedConfig>;
};
export type ChannelSetupWizardCredential = {
    inputKey: keyof ChannelSetupInput;
    providerHint: string;
    credentialLabel: string;
    preferredEnvVar?: string;
    helpTitle?: string;
    helpLines?: string[];
    envPrompt: string;
    keepPrompt: string;
    inputPrompt: string;
    allowEnv?: (params: {
        cfg: EnclawedConfig;
        accountId: string;
    }) => boolean;
    inspect: (params: {
        cfg: EnclawedConfig;
        accountId: string;
    }) => ChannelSetupWizardCredentialState;
    shouldPrompt?: (params: {
        cfg: EnclawedConfig;
        accountId: string;
        credentialValues: ChannelSetupWizardCredentialValues;
        currentValue?: string;
        state: ChannelSetupWizardCredentialState;
    }) => boolean | Promise<boolean>;
    applyUseEnv?: (params: {
        cfg: EnclawedConfig;
        accountId: string;
    }) => EnclawedConfig | Promise<EnclawedConfig>;
    applySet?: (params: {
        cfg: EnclawedConfig;
        accountId: string;
        credentialValues: ChannelSetupWizardCredentialValues;
        value: unknown;
        resolvedValue: string;
    }) => EnclawedConfig | Promise<EnclawedConfig>;
};
export type ChannelSetupWizardTextInput = {
    inputKey: keyof ChannelSetupInput;
    message: string;
    placeholder?: string;
    required?: boolean;
    applyEmptyValue?: boolean;
    helpTitle?: string;
    helpLines?: string[];
    confirmCurrentValue?: boolean;
    keepPrompt?: string | ((value: string) => string);
    currentValue?: (params: {
        cfg: EnclawedConfig;
        accountId: string;
        credentialValues: ChannelSetupWizardCredentialValues;
    }) => string | undefined | Promise<string | undefined>;
    initialValue?: (params: {
        cfg: EnclawedConfig;
        accountId: string;
        credentialValues: ChannelSetupWizardCredentialValues;
    }) => string | undefined | Promise<string | undefined>;
    shouldPrompt?: (params: {
        cfg: EnclawedConfig;
        accountId: string;
        credentialValues: ChannelSetupWizardCredentialValues;
        currentValue?: string;
    }) => boolean | Promise<boolean>;
    applyCurrentValue?: boolean;
    validate?: (params: {
        value: string;
        cfg: EnclawedConfig;
        accountId: string;
        credentialValues: ChannelSetupWizardCredentialValues;
    }) => string | undefined;
    normalizeValue?: (params: {
        value: string;
        cfg: EnclawedConfig;
        accountId: string;
        credentialValues: ChannelSetupWizardCredentialValues;
    }) => string;
    applySet?: (params: {
        cfg: EnclawedConfig;
        accountId: string;
        value: string;
    }) => EnclawedConfig | Promise<EnclawedConfig>;
};
export type ChannelSetupWizardAllowFromEntry = {
    input: string;
    resolved: boolean;
    id: string | null;
};
export type ChannelSetupWizardAllowFrom = {
    helpTitle?: string;
    helpLines?: string[];
    credentialInputKey?: keyof ChannelSetupInput;
    message: string;
    placeholder: string;
    invalidWithoutCredentialNote: string;
    parseInputs?: (raw: string) => string[];
    parseId: (raw: string) => string | null;
    resolveEntries: (params: {
        cfg: EnclawedConfig;
        accountId: string;
        credentialValues: ChannelSetupWizardCredentialValues;
        entries: string[];
    }) => Promise<ChannelSetupWizardAllowFromEntry[]>;
    apply: (params: {
        cfg: EnclawedConfig;
        accountId: string;
        allowFrom: string[];
    }) => EnclawedConfig | Promise<EnclawedConfig>;
};
export type ChannelSetupWizardGroupAccess = {
    label: string;
    placeholder: string;
    helpTitle?: string;
    helpLines?: string[];
    skipAllowlistEntries?: boolean;
    currentPolicy: (params: {
        cfg: EnclawedConfig;
        accountId: string;
    }) => ChannelAccessPolicy;
    currentEntries: (params: {
        cfg: EnclawedConfig;
        accountId: string;
    }) => string[];
    updatePrompt: (params: {
        cfg: EnclawedConfig;
        accountId: string;
    }) => boolean;
    setPolicy: (params: {
        cfg: EnclawedConfig;
        accountId: string;
        policy: ChannelAccessPolicy;
    }) => EnclawedConfig;
    resolveAllowlist?: (params: {
        cfg: EnclawedConfig;
        accountId: string;
        credentialValues: ChannelSetupWizardCredentialValues;
        entries: string[];
        prompter: Pick<WizardPrompter, "note">;
    }) => Promise<unknown>;
    applyAllowlist?: (params: {
        cfg: EnclawedConfig;
        accountId: string;
        resolved: unknown;
    }) => EnclawedConfig;
};
export type ChannelSetupWizardPrepare = (params: {
    cfg: EnclawedConfig;
    accountId: string;
    credentialValues: ChannelSetupWizardCredentialValues;
    runtime: ChannelSetupConfigureContext["runtime"];
    prompter: WizardPrompter;
    options?: ChannelSetupConfigureContext["options"];
}) => {
    cfg?: EnclawedConfig;
    credentialValues?: ChannelSetupWizardCredentialValues;
} | void | Promise<{
    cfg?: EnclawedConfig;
    credentialValues?: ChannelSetupWizardCredentialValues;
} | void>;
export type ChannelSetupWizardFinalize = (params: {
    cfg: EnclawedConfig;
    accountId: string;
    credentialValues: ChannelSetupWizardCredentialValues;
    runtime: ChannelSetupConfigureContext["runtime"];
    prompter: WizardPrompter;
    options?: ChannelSetupConfigureContext["options"];
    forceAllowFrom: boolean;
}) => {
    cfg?: EnclawedConfig;
    credentialValues?: ChannelSetupWizardCredentialValues;
} | void | Promise<{
    cfg?: EnclawedConfig;
    credentialValues?: ChannelSetupWizardCredentialValues;
} | void>;
export type ChannelSetupWizard = {
    channel: string;
    status: ChannelSetupWizardStatus;
    introNote?: ChannelSetupWizardNote;
    envShortcut?: ChannelSetupWizardEnvShortcut;
    resolveAccountIdForConfigure?: (params: {
        cfg: EnclawedConfig;
        prompter: WizardPrompter;
        options?: ChannelSetupConfigureContext["options"];
        accountOverride?: string;
        shouldPromptAccountIds: boolean;
        listAccountIds: ChannelSetupPlugin["config"]["listAccountIds"];
        defaultAccountId: string;
    }) => string | Promise<string>;
    resolveShouldPromptAccountIds?: (params: {
        cfg: EnclawedConfig;
        options?: ChannelSetupConfigureContext["options"];
        shouldPromptAccountIds: boolean;
    }) => boolean;
    prepare?: ChannelSetupWizardPrepare;
    stepOrder?: "credentials-first" | "text-first";
    credentials: ChannelSetupWizardCredential[];
    textInputs?: ChannelSetupWizardTextInput[];
    finalize?: ChannelSetupWizardFinalize;
    completionNote?: ChannelSetupWizardNote;
    dmPolicy?: ChannelSetupDmPolicy;
    allowFrom?: ChannelSetupWizardAllowFrom;
    groupAccess?: ChannelSetupWizardGroupAccess;
    disable?: (cfg: EnclawedConfig) => EnclawedConfig;
    onAccountRecorded?: ChannelSetupWizardAdapter["onAccountRecorded"];
};
export type SetupChannelsOptions = {
    allowDisable?: boolean;
    allowSignalInstall?: boolean;
    onSelection?: (selection: ChannelId[]) => void;
    onPostWriteHook?: (hook: ChannelOnboardingPostWriteHook) => void;
    accountIds?: Partial<Record<ChannelId, string>>;
    onAccountId?: (channel: ChannelId, accountId: string) => void;
    onResolvedPlugin?: (channel: ChannelId, plugin: ChannelSetupPlugin) => void;
    promptAccountIds?: boolean;
    forceAllowFromChannels?: ChannelId[];
    deferStatusUntilSelection?: boolean;
    skipStatusNote?: boolean;
    skipDmPolicyPrompt?: boolean;
    skipConfirm?: boolean;
    quickstartDefaults?: boolean;
    initialSelection?: ChannelId[];
    secretInputMode?: "plaintext" | "ref";
};
export type PromptAccountIdParams = {
    cfg: EnclawedConfig;
    prompter: WizardPrompter;
    label: string;
    currentId?: string;
    listAccountIds: (cfg: EnclawedConfig) => string[];
    defaultAccountId: string;
};
export type PromptAccountId = (params: PromptAccountIdParams) => Promise<string>;
export type ChannelSetupStatus = {
    channel: ChannelId;
    configured: boolean;
    statusLines: string[];
    selectionHint?: string;
    quickstartScore?: number;
};
export type ChannelSetupStatusContext = {
    cfg: EnclawedConfig;
    options?: SetupChannelsOptions;
    accountOverrides: Partial<Record<ChannelId, string>>;
};
export type ChannelSetupConfigureContext = {
    cfg: EnclawedConfig;
    runtime: RuntimeEnv;
    prompter: WizardPrompter;
    options?: SetupChannelsOptions;
    accountOverrides: Partial<Record<ChannelId, string>>;
    shouldPromptAccountIds: boolean;
    forceAllowFrom: boolean;
};
export type ChannelOnboardingPostWriteContext = {
    previousCfg: EnclawedConfig;
    cfg: EnclawedConfig;
    accountId: string;
    runtime: RuntimeEnv;
};
export type ChannelOnboardingPostWriteHook = {
    channel: ChannelId;
    accountId: string;
    run: (ctx: {
        cfg: EnclawedConfig;
        runtime: RuntimeEnv;
    }) => Promise<void> | void;
};
export type ChannelSetupResult = {
    cfg: EnclawedConfig;
    accountId?: string;
};
export type ChannelSetupConfiguredResult = ChannelSetupResult | "skip";
export type ChannelSetupInteractiveContext = ChannelSetupConfigureContext & {
    configured: boolean;
    label: string;
};
export type ChannelSetupDmPolicy = {
    label: string;
    channel: ChannelId;
    policyKey: string;
    allowFromKey: string;
    resolveConfigKeys?: (cfg: EnclawedConfig, accountId?: string) => {
        policyKey: string;
        allowFromKey: string;
    };
    getCurrent: (cfg: EnclawedConfig, accountId?: string) => DmPolicy;
    setPolicy: (cfg: EnclawedConfig, policy: DmPolicy, accountId?: string) => EnclawedConfig;
    promptAllowFrom?: (params: {
        cfg: EnclawedConfig;
        prompter: WizardPrompter;
        accountId?: string;
    }) => Promise<EnclawedConfig>;
};
export type ChannelSetupWizardAdapter = {
    channel: ChannelId;
    getStatus: (ctx: ChannelSetupStatusContext) => Promise<ChannelSetupStatus>;
    configure: (ctx: ChannelSetupConfigureContext) => Promise<ChannelSetupResult>;
    configureInteractive?: (ctx: ChannelSetupInteractiveContext) => Promise<ChannelSetupConfiguredResult>;
    configureWhenConfigured?: (ctx: ChannelSetupInteractiveContext) => Promise<ChannelSetupConfiguredResult>;
    afterConfigWritten?: (ctx: ChannelOnboardingPostWriteContext) => Promise<void> | void;
    dmPolicy?: ChannelSetupDmPolicy;
    onAccountRecorded?: (accountId: string, options?: SetupChannelsOptions) => void;
    disable?: (cfg: EnclawedConfig) => EnclawedConfig;
};
