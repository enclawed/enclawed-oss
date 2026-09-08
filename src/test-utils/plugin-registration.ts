import { createCapturedPluginRegistration } from "../plugins/captured-registration.js";
import type {
  ImageGenerationProviderPlugin,
  MediaUnderstandingProviderPlugin,
  MusicGenerationProviderPlugin,
  EnclawedPluginApi,
  ProviderPlugin,
  RealtimeTranscriptionProviderPlugin,
  SpeechProviderPlugin,
  VideoGenerationProviderPlugin,
} from "../plugins/types.js";

export { createCapturedPluginRegistration };

type RegistrablePlugin = {
  register(api: EnclawedPluginApi): void;
};

export async function registerSingleProviderPlugin(params: {
  register(api: EnclawedPluginApi): void;
}): Promise<ProviderPlugin> {
  const captured = createCapturedPluginRegistration();
  params.register(captured.api);
  const provider = captured.providers[0];
  if (!provider) {
    throw new Error("provider registration missing");
  }
  return provider;
}

export async function registerProviderPlugins(
  ...plugins: RegistrablePlugin[]
): Promise<ProviderPlugin[]> {
  const captured = createCapturedPluginRegistration();
  for (const plugin of plugins) {
    plugin.register(captured.api);
  }
  return captured.providers;
}

export function requireRegisteredProvider<T extends { id: string }>(
  providers: readonly T[],
  providerId: string,
  label = "provider",
): T {
  const provider = providers.find((entry) => entry.id === providerId);
  if (!provider) {
    throw new Error(`${label} ${providerId} missing`);
  }
  return provider;
}

export type RegisteredProviderCollections = {
  providers: ProviderPlugin[];
  realtimeTranscriptionProviders: RealtimeTranscriptionProviderPlugin[];
  speechProviders: SpeechProviderPlugin[];
  mediaProviders: MediaUnderstandingProviderPlugin[];
  imageProviders: ImageGenerationProviderPlugin[];
  musicProviders: MusicGenerationProviderPlugin[];
  videoProviders: VideoGenerationProviderPlugin[];
};

export async function registerProviderPlugin(params: {
  plugin: RegistrablePlugin;
  id: string;
  name: string;
}): Promise<RegisteredProviderCollections> {
  const captured = createCapturedPluginRegistration({
    id: params.id,
    name: params.name,
    source: params.id,
  });
  params.plugin.register(captured.api);
  return {
    providers: captured.providers,
    realtimeTranscriptionProviders: captured.realtimeTranscriptionProviders,
    speechProviders: captured.speechProviders,
    mediaProviders: captured.mediaUnderstandingProviders,
    imageProviders: captured.imageGenerationProviders,
    musicProviders: captured.musicGenerationProviders,
    videoProviders: captured.videoGenerationProviders,
  };
}
