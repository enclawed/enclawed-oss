import { createCapturedPluginRegistration } from "../plugins/captured-registration.js";
import type { ImageGenerationProviderPlugin, MediaUnderstandingProviderPlugin, MusicGenerationProviderPlugin, EnclawedPluginApi, ProviderPlugin, RealtimeTranscriptionProviderPlugin, SpeechProviderPlugin, VideoGenerationProviderPlugin } from "../plugins/types.js";
export { createCapturedPluginRegistration };
type RegistrablePlugin = {
    register(api: EnclawedPluginApi): void;
};
export declare function registerSingleProviderPlugin(params: {
    register(api: EnclawedPluginApi): void;
}): Promise<ProviderPlugin>;
export declare function registerProviderPlugins(...plugins: RegistrablePlugin[]): Promise<ProviderPlugin[]>;
export declare function requireRegisteredProvider<T extends {
    id: string;
}>(providers: readonly T[], providerId: string, label?: string): T;
export type RegisteredProviderCollections = {
    providers: ProviderPlugin[];
    realtimeTranscriptionProviders: RealtimeTranscriptionProviderPlugin[];
    speechProviders: SpeechProviderPlugin[];
    mediaProviders: MediaUnderstandingProviderPlugin[];
    imageProviders: ImageGenerationProviderPlugin[];
    musicProviders: MusicGenerationProviderPlugin[];
    videoProviders: VideoGenerationProviderPlugin[];
};
export declare function registerProviderPlugin(params: {
    plugin: RegistrablePlugin;
    id: string;
    name: string;
}): Promise<RegisteredProviderCollections>;
