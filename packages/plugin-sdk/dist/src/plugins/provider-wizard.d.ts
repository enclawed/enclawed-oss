import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import type { ProviderAuthMethod, ProviderPlugin, ProviderPluginWizardSetup } from "./types.js";
export declare const PROVIDER_PLUGIN_CHOICE_PREFIX = "provider-plugin:";
export type ProviderWizardOption = {
    value: string;
    label: string;
    hint?: string;
    groupId: string;
    groupLabel: string;
    groupHint?: string;
    onboardingScopes?: Array<"text-inference" | "image-generation">;
    assistantPriority?: number;
    assistantVisibility?: "visible" | "manual-only";
};
export type ProviderModelPickerEntry = {
    value: string;
    label: string;
    hint?: string;
};
export declare function buildProviderPluginMethodChoice(providerId: string, methodId: string): string;
type ProviderWizardProvidersResolver = (params: {
    config?: EnclawedConfig;
    workspaceDir?: string;
    env?: NodeJS.ProcessEnv;
}) => ProviderPlugin[];
/**
 * Test seam: override the provider resolver used by the wizard. Returns a
 * restore function that reverts the override. Real callers must never use
 * this; it exists exclusively for contract test suites that need to drive
 * deterministic provider lists into the wizard without touching the actual
 * plugin registry.
 */
export declare function setProviderWizardProvidersResolverForTest(resolver: ProviderWizardProvidersResolver | undefined): () => void;
export declare function resolveProviderWizardOptions(params: {
    config?: EnclawedConfig;
    workspaceDir?: string;
    env?: NodeJS.ProcessEnv;
}): ProviderWizardOption[];
export declare function resolveProviderModelPickerEntries(params: {
    config?: EnclawedConfig;
    workspaceDir?: string;
    env?: NodeJS.ProcessEnv;
}): ProviderModelPickerEntry[];
export declare function resolveProviderPluginChoice(params: {
    providers: ProviderPlugin[];
    choice: string;
}): {
    provider: ProviderPlugin;
    method: ProviderAuthMethod;
    wizard?: ProviderPluginWizardSetup;
} | null;
export declare function runProviderModelSelectedHook(params: {
    config: EnclawedConfig;
    model: string;
    prompter: WizardPrompter;
    agentDir?: string;
    workspaceDir?: string;
    env?: NodeJS.ProcessEnv;
}): Promise<void>;
export {};
