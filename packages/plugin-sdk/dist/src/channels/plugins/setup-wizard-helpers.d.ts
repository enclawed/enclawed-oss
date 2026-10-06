import type { DmPolicy, GroupPolicy } from "../../config/types.base.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { SecretInput } from "../../config/types.secrets.js";
import type { WizardPrompter } from "../../wizard/prompts.js";
import type { ChannelSetupDmPolicy, ChannelSetupWizard, ChannelSetupWizardAllowFromEntry, ChannelSetupWizardStatus, PromptAccountId } from "./setup-wizard-types.js";
export declare const promptAccountId: PromptAccountId;
export declare function addWildcardAllowFrom(allowFrom?: ReadonlyArray<string | number> | null): string[];
export declare function mergeAllowFromEntries(current: Array<string | number> | null | undefined, additions: Array<string | number>): string[];
export declare function splitSetupEntries(raw: string): string[];
type ParsedSetupEntry = {
    value: string;
} | {
    error: string;
};
export declare function parseSetupEntriesWithParser(raw: string, parseEntry: (entry: string) => ParsedSetupEntry): {
    entries: string[];
    error?: string;
};
export declare function parseSetupEntriesAllowingWildcard(raw: string, parseEntry: (entry: string) => ParsedSetupEntry): {
    entries: string[];
    error?: string;
};
export declare function parseMentionOrPrefixedId(params: {
    value: string;
    mentionPattern: RegExp;
    prefixPattern?: RegExp;
    idPattern: RegExp;
    normalizeId?: (id: string) => string;
}): string | null;
export declare function normalizeAllowFromEntries(entries: Array<string | number>, normalizeEntry?: (value: string) => string | null | undefined): string[];
export declare function createStandardChannelSetupStatus(params: {
    channelLabel: string;
    configuredLabel: string;
    unconfiguredLabel: string;
    configuredHint?: string;
    unconfiguredHint?: string;
    configuredScore?: number;
    unconfiguredScore?: number;
    includeStatusLine?: boolean;
    resolveConfigured: ChannelSetupWizardStatus["resolveConfigured"];
    resolveExtraStatusLines?: (params: {
        cfg: EnclawedConfig;
        accountId?: string;
        configured: boolean;
    }) => string[] | Promise<string[]>;
}): ChannelSetupWizardStatus;
export declare function resolveSetupAccountId(params: {
    accountId?: string;
    defaultAccountId: string;
}): string;
export declare function resolveAccountIdForConfigure(params: {
    cfg: EnclawedConfig;
    prompter: WizardPrompter;
    label: string;
    accountOverride?: string;
    shouldPromptAccountIds: boolean;
    listAccountIds: (cfg: EnclawedConfig) => string[];
    defaultAccountId: string;
}): Promise<string>;
export declare function setAccountAllowFromForChannel(params: {
    cfg: EnclawedConfig;
    channel: string;
    accountId: string;
    allowFrom: string[];
}): EnclawedConfig;
export declare function patchTopLevelChannelConfigSection(params: {
    cfg: EnclawedConfig;
    channel: string;
    enabled?: boolean;
    clearFields?: string[];
    patch: Record<string, unknown>;
}): EnclawedConfig;
export declare function patchNestedChannelConfigSection(params: {
    cfg: EnclawedConfig;
    channel: string;
    section: string;
    enabled?: boolean;
    clearFields?: string[];
    patch: Record<string, unknown>;
}): EnclawedConfig;
export declare function setTopLevelChannelAllowFrom(params: {
    cfg: EnclawedConfig;
    channel: string;
    allowFrom: string[];
    enabled?: boolean;
}): EnclawedConfig;
export declare function setNestedChannelAllowFrom(params: {
    cfg: EnclawedConfig;
    channel: string;
    section: string;
    allowFrom: string[];
    enabled?: boolean;
}): EnclawedConfig;
export declare function setTopLevelChannelDmPolicyWithAllowFrom(params: {
    cfg: EnclawedConfig;
    channel: string;
    dmPolicy: DmPolicy;
    getAllowFrom?: (cfg: EnclawedConfig) => Array<string | number> | undefined;
}): EnclawedConfig;
export declare function setNestedChannelDmPolicyWithAllowFrom(params: {
    cfg: EnclawedConfig;
    channel: string;
    section: string;
    dmPolicy: DmPolicy;
    getAllowFrom?: (cfg: EnclawedConfig) => Array<string | number> | undefined;
    enabled?: boolean;
}): EnclawedConfig;
export declare function setTopLevelChannelGroupPolicy(params: {
    cfg: EnclawedConfig;
    channel: string;
    groupPolicy: GroupPolicy;
    enabled?: boolean;
}): EnclawedConfig;
export declare function createTopLevelChannelDmPolicy(params: {
    label: string;
    channel: string;
    policyKey: string;
    allowFromKey: string;
    getCurrent: (cfg: EnclawedConfig) => DmPolicy;
    promptAllowFrom?: ChannelSetupDmPolicy["promptAllowFrom"];
    getAllowFrom?: (cfg: EnclawedConfig) => Array<string | number> | undefined;
}): ChannelSetupDmPolicy;
export declare function createNestedChannelDmPolicy(params: {
    label: string;
    channel: string;
    section: string;
    policyKey: string;
    allowFromKey: string;
    getCurrent: (cfg: EnclawedConfig) => DmPolicy;
    promptAllowFrom?: ChannelSetupDmPolicy["promptAllowFrom"];
    getAllowFrom?: (cfg: EnclawedConfig) => Array<string | number> | undefined;
    enabled?: boolean;
}): ChannelSetupDmPolicy;
export declare function createTopLevelChannelDmPolicySetter(params: {
    channel: string;
    getAllowFrom?: (cfg: EnclawedConfig) => Array<string | number> | undefined;
}): (cfg: EnclawedConfig, dmPolicy: DmPolicy) => EnclawedConfig;
export declare function createNestedChannelDmPolicySetter(params: {
    channel: string;
    section: string;
    getAllowFrom?: (cfg: EnclawedConfig) => Array<string | number> | undefined;
    enabled?: boolean;
}): (cfg: EnclawedConfig, dmPolicy: DmPolicy) => EnclawedConfig;
export declare function createTopLevelChannelAllowFromSetter(params: {
    channel: string;
    enabled?: boolean;
}): (cfg: EnclawedConfig, allowFrom: string[]) => EnclawedConfig;
export declare function createNestedChannelAllowFromSetter(params: {
    channel: string;
    section: string;
    enabled?: boolean;
}): (cfg: EnclawedConfig, allowFrom: string[]) => EnclawedConfig;
export declare function createTopLevelChannelGroupPolicySetter(params: {
    channel: string;
    enabled?: boolean;
}): (cfg: EnclawedConfig, groupPolicy: "open" | "allowlist" | "disabled") => EnclawedConfig;
export declare function setChannelDmPolicyWithAllowFrom(params: {
    cfg: EnclawedConfig;
    channel: string;
    dmPolicy: DmPolicy;
}): EnclawedConfig;
export declare function setCompatChannelDmPolicyWithAllowFrom(params: {
    cfg: EnclawedConfig;
    channel: string;
    dmPolicy: DmPolicy;
}): EnclawedConfig;
export declare function setCompatChannelAllowFrom(params: {
    cfg: EnclawedConfig;
    channel: string;
    allowFrom: string[];
}): EnclawedConfig;
export declare function setAccountGroupPolicyForChannel(params: {
    cfg: EnclawedConfig;
    channel: string;
    accountId: string;
    groupPolicy: GroupPolicy;
}): EnclawedConfig;
export declare function setAccountDmAllowFromForChannel(params: {
    cfg: EnclawedConfig;
    channel: string;
    accountId: string;
    allowFrom: string[];
}): EnclawedConfig;
export declare function createCompatChannelDmPolicy(params: {
    label: string;
    channel: string;
    promptAllowFrom?: ChannelSetupDmPolicy["promptAllowFrom"];
}): ChannelSetupDmPolicy;
export declare function resolveGroupAllowlistWithLookupNotes<TResolved>(params: {
    label: string;
    prompter: Pick<WizardPrompter, "note">;
    entries: string[];
    fallback: TResolved;
    resolve: () => Promise<TResolved>;
}): Promise<TResolved>;
export declare function createAccountScopedAllowFromSection(params: {
    channel: string;
    credentialInputKey?: NonNullable<ChannelSetupWizard["allowFrom"]>["credentialInputKey"];
    helpTitle?: string;
    helpLines?: string[];
    message: string;
    placeholder: string;
    invalidWithoutCredentialNote: string;
    parseId: NonNullable<NonNullable<ChannelSetupWizard["allowFrom"]>["parseId"]>;
    resolveEntries: NonNullable<NonNullable<ChannelSetupWizard["allowFrom"]>["resolveEntries"]>;
}): NonNullable<ChannelSetupWizard["allowFrom"]>;
export declare function createAccountScopedGroupAccessSection<TResolved>(params: {
    channel: string;
    label: string;
    placeholder: string;
    helpTitle?: string;
    helpLines?: string[];
    skipAllowlistEntries?: boolean;
    currentPolicy: NonNullable<ChannelSetupWizard["groupAccess"]>["currentPolicy"];
    currentEntries: NonNullable<ChannelSetupWizard["groupAccess"]>["currentEntries"];
    updatePrompt: NonNullable<ChannelSetupWizard["groupAccess"]>["updatePrompt"];
    resolveAllowlist?: NonNullable<NonNullable<ChannelSetupWizard["groupAccess"]>["resolveAllowlist"]>;
    fallbackResolved: (entries: string[]) => TResolved;
    applyAllowlist: (params: {
        cfg: EnclawedConfig;
        accountId: string;
        resolved: TResolved;
    }) => EnclawedConfig;
}): NonNullable<ChannelSetupWizard["groupAccess"]>;
type AccountScopedChannel = string;
type CompatDmChannel = string;
export declare function patchCompatDmChannelConfig(params: {
    cfg: EnclawedConfig;
    channel: string;
    patch: Record<string, unknown>;
}): EnclawedConfig;
export declare function setSetupChannelEnabled(cfg: EnclawedConfig, channel: string, enabled: boolean): EnclawedConfig;
export declare function patchChannelConfigForAccount(params: {
    cfg: EnclawedConfig;
    channel: AccountScopedChannel;
    accountId: string;
    patch: Record<string, unknown>;
}): EnclawedConfig;
export declare function applySingleTokenPromptResult(params: {
    cfg: EnclawedConfig;
    channel: string;
    accountId: string;
    tokenPatchKey: string;
    tokenResult: {
        useEnv: boolean;
        token: SecretInput | null;
    };
}): EnclawedConfig;
export declare function buildSingleChannelSecretPromptState(params: {
    accountConfigured: boolean;
    hasConfigToken: boolean;
    allowEnv: boolean;
    envValue?: string;
}): {
    accountConfigured: boolean;
    hasConfigToken: boolean;
    canUseEnv: boolean;
};
export declare function promptSingleChannelToken(params: {
    prompter: Pick<WizardPrompter, "confirm" | "text">;
    accountConfigured: boolean;
    canUseEnv: boolean;
    hasConfigToken: boolean;
    envPrompt: string;
    keepPrompt: string;
    inputPrompt: string;
}): Promise<{
    useEnv: boolean;
    token: string | null;
}>;
export type SingleChannelSecretInputPromptResult = {
    action: "keep";
} | {
    action: "use-env";
} | {
    action: "set";
    value: SecretInput;
    resolvedValue: string;
};
export declare function runSingleChannelSecretStep(params: {
    cfg: EnclawedConfig;
    prompter: Pick<WizardPrompter, "confirm" | "text" | "select" | "note">;
    providerHint: string;
    credentialLabel: string;
    secretInputMode?: "plaintext" | "ref";
    accountConfigured: boolean;
    hasConfigToken: boolean;
    allowEnv: boolean;
    envValue?: string;
    envPrompt: string;
    keepPrompt: string;
    inputPrompt: string;
    preferredEnvVar?: string;
    onMissingConfigured?: () => Promise<void>;
    applyUseEnv?: (cfg: EnclawedConfig) => EnclawedConfig | Promise<EnclawedConfig>;
    applySet?: (cfg: EnclawedConfig, value: SecretInput, resolvedValue: string) => EnclawedConfig | Promise<EnclawedConfig>;
}): Promise<{
    cfg: EnclawedConfig;
    action: SingleChannelSecretInputPromptResult["action"];
    resolvedValue?: string;
}>;
export declare function promptSingleChannelSecretInput(params: {
    cfg: EnclawedConfig;
    prompter: Pick<WizardPrompter, "confirm" | "text" | "select" | "note">;
    providerHint: string;
    credentialLabel: string;
    secretInputMode?: "plaintext" | "ref";
    accountConfigured: boolean;
    canUseEnv: boolean;
    hasConfigToken: boolean;
    envPrompt: string;
    keepPrompt: string;
    inputPrompt: string;
    preferredEnvVar?: string;
}): Promise<SingleChannelSecretInputPromptResult>;
type ParsedAllowFromResult = {
    entries: string[];
    error?: string;
};
export declare function promptParsedAllowFromForAccount<TConfig extends EnclawedConfig>(params: {
    cfg: TConfig;
    accountId?: string;
    defaultAccountId: string;
    prompter: Pick<WizardPrompter, "note" | "text">;
    noteTitle?: string;
    noteLines?: string[];
    message: string;
    placeholder: string;
    parseEntries: (raw: string) => ParsedAllowFromResult;
    getExistingAllowFrom: (params: {
        cfg: TConfig;
        accountId: string;
    }) => Array<string | number>;
    mergeEntries?: (params: {
        existing: Array<string | number>;
        parsed: string[];
    }) => string[];
    applyAllowFrom: (params: {
        cfg: TConfig;
        accountId: string;
        allowFrom: string[];
    }) => TConfig | Promise<TConfig>;
}): Promise<TConfig>;
export declare function createPromptParsedAllowFromForAccount<TConfig extends EnclawedConfig>(params: {
    defaultAccountId: string | ((cfg: TConfig) => string);
    noteTitle?: string;
    noteLines?: string[];
    message: string;
    placeholder: string;
    parseEntries: (raw: string) => ParsedAllowFromResult;
    getExistingAllowFrom: (params: {
        cfg: TConfig;
        accountId: string;
    }) => Array<string | number>;
    mergeEntries?: (params: {
        existing: Array<string | number>;
        parsed: string[];
    }) => string[];
    applyAllowFrom: (params: {
        cfg: TConfig;
        accountId: string;
        allowFrom: string[];
    }) => TConfig | Promise<TConfig>;
}): NonNullable<ChannelSetupDmPolicy["promptAllowFrom"]>;
export declare function promptParsedAllowFromForScopedChannel(params: {
    cfg: EnclawedConfig;
    channel: string;
    accountId?: string;
    defaultAccountId: string;
    prompter: Pick<WizardPrompter, "note" | "text">;
    noteTitle: string;
    noteLines: string[];
    message: string;
    placeholder: string;
    parseEntries: (raw: string) => ParsedAllowFromResult;
    getExistingAllowFrom: (params: {
        cfg: EnclawedConfig;
        accountId: string;
    }) => Array<string | number>;
}): Promise<EnclawedConfig>;
export declare function createTopLevelChannelParsedAllowFromPrompt(params: {
    channel: string;
    defaultAccountId: string | ((cfg: EnclawedConfig) => string);
    enabled?: boolean;
    noteTitle?: string;
    noteLines?: string[];
    message: string;
    placeholder: string;
    parseEntries: (raw: string) => ParsedAllowFromResult;
    getExistingAllowFrom?: (cfg: EnclawedConfig) => Array<string | number>;
    mergeEntries?: (params: {
        existing: Array<string | number>;
        parsed: string[];
    }) => string[];
}): NonNullable<ChannelSetupDmPolicy["promptAllowFrom"]>;
export declare function createNestedChannelParsedAllowFromPrompt(params: {
    channel: string;
    section: string;
    defaultAccountId: string | ((cfg: EnclawedConfig) => string);
    enabled?: boolean;
    noteTitle?: string;
    noteLines?: string[];
    message: string;
    placeholder: string;
    parseEntries: (raw: string) => ParsedAllowFromResult;
    getExistingAllowFrom?: (cfg: EnclawedConfig) => Array<string | number>;
    mergeEntries?: (params: {
        existing: Array<string | number>;
        parsed: string[];
    }) => string[];
}): NonNullable<ChannelSetupDmPolicy["promptAllowFrom"]>;
export declare function resolveParsedAllowFromEntries(params: {
    entries: string[];
    parseId: (raw: string) => string | null;
}): ChannelSetupWizardAllowFromEntry[];
export declare function createAllowFromSection(params: {
    helpTitle?: string;
    helpLines?: string[];
    credentialInputKey?: NonNullable<ChannelSetupWizard["allowFrom"]>["credentialInputKey"];
    message: string;
    placeholder: string;
    invalidWithoutCredentialNote: string;
    parseInputs?: NonNullable<NonNullable<ChannelSetupWizard["allowFrom"]>["parseInputs"]>;
    parseId: NonNullable<NonNullable<ChannelSetupWizard["allowFrom"]>["parseId"]>;
    resolveEntries?: NonNullable<NonNullable<ChannelSetupWizard["allowFrom"]>["resolveEntries"]>;
    apply: NonNullable<NonNullable<ChannelSetupWizard["allowFrom"]>["apply"]>;
}): NonNullable<ChannelSetupWizard["allowFrom"]>;
export declare function noteChannelLookupSummary(params: {
    prompter: Pick<WizardPrompter, "note">;
    label: string;
    resolvedSections: Array<{
        title: string;
        values: string[];
    }>;
    unresolved?: string[];
}): Promise<void>;
export declare function noteChannelLookupFailure(params: {
    prompter: Pick<WizardPrompter, "note">;
    label: string;
    error: unknown;
}): Promise<void>;
type AllowFromResolution = {
    input: string;
    resolved: boolean;
    id?: string | null;
};
export declare function resolveEntriesWithOptionalToken<TResult>(params: {
    token?: string | null;
    entries: string[];
    buildWithoutToken: (input: string) => TResult;
    resolveEntries: (params: {
        token: string;
        entries: string[];
    }) => Promise<TResult[]>;
}): Promise<TResult[]>;
export declare function promptResolvedAllowFrom(params: {
    prompter: WizardPrompter;
    existing: Array<string | number>;
    token?: string | null;
    message: string;
    placeholder: string;
    label: string;
    parseInputs: (value: string) => string[];
    parseId: (value: string) => string | null;
    invalidWithoutTokenNote: string;
    resolveEntries: (params: {
        token: string;
        entries: string[];
    }) => Promise<AllowFromResolution[]>;
}): Promise<string[]>;
export declare function promptLegacyChannelAllowFrom(params: {
    cfg: EnclawedConfig;
    channel: CompatDmChannel;
    prompter: WizardPrompter;
    existing: Array<string | number>;
    token?: string | null;
    noteTitle: string;
    noteLines: string[];
    message: string;
    placeholder: string;
    parseId: (value: string) => string | null;
    invalidWithoutTokenNote: string;
    resolveEntries: (params: {
        token: string;
        entries: string[];
    }) => Promise<AllowFromResolution[]>;
}): Promise<EnclawedConfig>;
export declare function promptLegacyChannelAllowFromForAccount<TAccount>(params: {
    cfg: EnclawedConfig;
    channel: CompatDmChannel;
    prompter: WizardPrompter;
    accountId?: string;
    defaultAccountId: string;
    resolveAccount: (cfg: EnclawedConfig, accountId: string) => TAccount;
    resolveExisting: (account: TAccount, cfg: EnclawedConfig) => Array<string | number>;
    resolveToken: (account: TAccount) => string | null | undefined;
    noteTitle: string;
    noteLines: string[];
    message: string;
    placeholder: string;
    parseId: (value: string) => string | null;
    invalidWithoutTokenNote: string;
    resolveEntries: (params: {
        token: string;
        entries: string[];
    }) => Promise<AllowFromResolution[]>;
}): Promise<EnclawedConfig>;
export declare const patchLegacyDmChannelConfig: typeof patchCompatDmChannelConfig;
export declare const setLegacyChannelDmPolicyWithAllowFrom: typeof setCompatChannelDmPolicyWithAllowFrom;
export declare const setLegacyChannelAllowFrom: typeof setCompatChannelAllowFrom;
export declare const createLegacyCompatChannelDmPolicy: typeof createCompatChannelDmPolicy;
export {};
