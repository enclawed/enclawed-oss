import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { MemoryEmbeddingProviderAdapter } from "./memory-embedding-providers.js";
import type { AnyAgentTool, AgentHarness, CliBackendPlugin, ImageGenerationProviderPlugin, MediaUnderstandingProviderPlugin, MigrationProviderPlugin, MusicGenerationProviderPlugin, EnclawedPluginApi, EnclawedPluginCliCommandDescriptor, EnclawedPluginCliRegistrar, PluginTextTransformRegistration, ProviderPlugin, RealtimeTranscriptionProviderPlugin, RealtimeVoiceProviderPlugin, SpeechProviderPlugin, VideoGenerationProviderPlugin, WebFetchProviderPlugin, WebSearchProviderPlugin } from "./types.js";
type CapturedPluginCliRegistration = {
    register: EnclawedPluginCliRegistrar;
    commands: string[];
    descriptors: EnclawedPluginCliCommandDescriptor[];
};
export type CapturedPluginRegistration = {
    api: EnclawedPluginApi;
    providers: ProviderPlugin[];
    agentHarnesses: AgentHarness[];
    cliRegistrars: CapturedPluginCliRegistration[];
    cliBackends: CliBackendPlugin[];
    textTransforms: PluginTextTransformRegistration[];
    speechProviders: SpeechProviderPlugin[];
    realtimeTranscriptionProviders: RealtimeTranscriptionProviderPlugin[];
    realtimeVoiceProviders: RealtimeVoiceProviderPlugin[];
    mediaUnderstandingProviders: MediaUnderstandingProviderPlugin[];
    imageGenerationProviders: ImageGenerationProviderPlugin[];
    videoGenerationProviders: VideoGenerationProviderPlugin[];
    musicGenerationProviders: MusicGenerationProviderPlugin[];
    webFetchProviders: WebFetchProviderPlugin[];
    webSearchProviders: WebSearchProviderPlugin[];
    memoryEmbeddingProviders: MemoryEmbeddingProviderAdapter[];
    migrationProviders: MigrationProviderPlugin[];
    tools: AnyAgentTool[];
};
export declare function createCapturedPluginRegistration(params?: {
    config?: EnclawedConfig;
    registrationMode?: EnclawedPluginApi["registrationMode"];
    /** Optional plugin metadata used to populate the captured `api`'s identity
     *  triple. Tests that capture the api id can override these to mimic the
     *  identity a real loader would assign. Defaults match the original
     *  "captured-plugin-registration" identity to preserve existing snapshots. */
    id?: string;
    name?: string;
    source?: string;
}): CapturedPluginRegistration;
export declare function capturePluginRegistration(params: {
    register(api: EnclawedPluginApi): void;
}): CapturedPluginRegistration;
export {};
