import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { WizardPrompter } from "../../wizard/prompts.js";
import { type ChannelAccessPolicy } from "./setup-group-access.js";
export declare function configureChannelAccessWithAllowlist<TResolved>(params: {
    cfg: EnclawedConfig;
    prompter: WizardPrompter;
    label: string;
    currentPolicy: ChannelAccessPolicy;
    currentEntries: string[];
    placeholder: string;
    updatePrompt: boolean;
    skipAllowlistEntries?: boolean;
    setPolicy: (cfg: EnclawedConfig, policy: ChannelAccessPolicy) => EnclawedConfig;
    resolveAllowlist?: (params: {
        cfg: EnclawedConfig;
        entries: string[];
    }) => Promise<TResolved>;
    applyAllowlist?: (params: {
        cfg: EnclawedConfig;
        resolved: TResolved;
    }) => EnclawedConfig;
}): Promise<EnclawedConfig>;
