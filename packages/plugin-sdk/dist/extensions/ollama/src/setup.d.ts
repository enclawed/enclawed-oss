import type { EnclawedConfig, SecretInput, SecretInputMode } from "@enclawed/plugin-sdk/provider-auth";
import type { RuntimeEnv } from "@enclawed/plugin-sdk/runtime";
import { type WizardPrompter } from "@enclawed/plugin-sdk/setup";
import { buildOllamaModelDefinition } from "./provider-models.js";
type OllamaSetupOptions = {
    customBaseUrl?: string;
    customModelId?: string;
};
type OllamaSetupResult = {
    config: EnclawedConfig;
    credential: SecretInput;
    credentialMode?: SecretInputMode;
};
type ProviderConfig = {
    baseUrl: string;
    api: "ollama";
    models: ReturnType<typeof buildOllamaModelDefinition>[];
};
export declare function checkOllamaCloudAuth(baseUrl: string): Promise<{
    signedIn: boolean;
    signinUrl?: string;
}>;
export declare function buildOllamaProvider(configuredBaseUrl?: string, opts?: {
    quiet?: boolean;
}): Promise<ProviderConfig>;
export declare function promptAndConfigureOllama(params: {
    cfg: EnclawedConfig;
    env?: NodeJS.ProcessEnv;
    opts?: Record<string, unknown>;
    prompter: WizardPrompter;
    secretInputMode?: SecretInputMode;
    allowSecretRefPrompt?: boolean;
}): Promise<OllamaSetupResult>;
export declare function configureOllamaNonInteractive(params: {
    nextConfig: EnclawedConfig;
    opts: OllamaSetupOptions;
    runtime: RuntimeEnv;
    agentDir?: string;
}): Promise<EnclawedConfig>;
export declare function ensureOllamaModelPulled(params: {
    config: EnclawedConfig;
    model: string;
    prompter: WizardPrompter;
}): Promise<void>;
export {};
