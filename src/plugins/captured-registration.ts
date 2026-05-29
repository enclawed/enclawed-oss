import type { EnclawedConfig } from "../config/types.enclawed.js";
import { buildPluginApi } from "./api-builder.js";
import type { MemoryEmbeddingProviderAdapter } from "./memory-embedding-providers.js";
import type { PluginRuntime } from "./runtime/types.js";
import type {
  AnyAgentTool,
  AgentHarness,
  CliBackendPlugin,
  ImageGenerationProviderPlugin,
  MediaUnderstandingProviderPlugin,
  MigrationProviderPlugin,
  MusicGenerationProviderPlugin,
  EnclawedPluginApi,
  EnclawedPluginCliCommandDescriptor,
  EnclawedPluginCliRegistrar,
  PluginTextTransformRegistration,
  ProviderPlugin,
  RealtimeTranscriptionProviderPlugin,
  RealtimeVoiceProviderPlugin,
  SpeechProviderPlugin,
  VideoGenerationProviderPlugin,
  WebFetchProviderPlugin,
  WebSearchProviderPlugin,
} from "./types.js";

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

export function createCapturedPluginRegistration(params?: {
  config?: EnclawedConfig;
  registrationMode?: EnclawedPluginApi["registrationMode"];
  /** Optional plugin metadata used to populate the captured `api`'s identity
   *  triple. Tests that capture the api id can override these to mimic the
   *  identity a real loader would assign. Defaults match the original
   *  "captured-plugin-registration" identity to preserve existing snapshots. */
  id?: string;
  name?: string;
  source?: string;
}): CapturedPluginRegistration {
  const providers: ProviderPlugin[] = [];
  const agentHarnesses: AgentHarness[] = [];
  const cliRegistrars: CapturedPluginCliRegistration[] = [];
  const cliBackends: CliBackendPlugin[] = [];
  const textTransforms: PluginTextTransformRegistration[] = [];
  const speechProviders: SpeechProviderPlugin[] = [];
  const realtimeTranscriptionProviders: RealtimeTranscriptionProviderPlugin[] = [];
  const realtimeVoiceProviders: RealtimeVoiceProviderPlugin[] = [];
  const mediaUnderstandingProviders: MediaUnderstandingProviderPlugin[] = [];
  const imageGenerationProviders: ImageGenerationProviderPlugin[] = [];
  const videoGenerationProviders: VideoGenerationProviderPlugin[] = [];
  const musicGenerationProviders: MusicGenerationProviderPlugin[] = [];
  const webFetchProviders: WebFetchProviderPlugin[] = [];
  const webSearchProviders: WebSearchProviderPlugin[] = [];
  const memoryEmbeddingProviders: MemoryEmbeddingProviderAdapter[] = [];
  const migrationProviders: MigrationProviderPlugin[] = [];
  const tools: AnyAgentTool[] = [];
  const noopLogger = {
    info() {},
    warn() {},
    error() {},
    debug() {},
  };

  return {
    providers,
    agentHarnesses,
    cliRegistrars,
    cliBackends,
    textTransforms,
    speechProviders,
    realtimeTranscriptionProviders,
    realtimeVoiceProviders,
    mediaUnderstandingProviders,
    imageGenerationProviders,
    videoGenerationProviders,
    musicGenerationProviders,
    webFetchProviders,
    webSearchProviders,
    memoryEmbeddingProviders,
    migrationProviders,
    tools,
    api: buildPluginApi({
      id: params?.id ?? "captured-plugin-registration",
      name: params?.name ?? "Captured Plugin Registration",
      source: params?.source ?? "captured-plugin-registration",
      registrationMode: params?.registrationMode ?? "full",
      config: params?.config ?? ({} as EnclawedConfig),
      runtime: {} as PluginRuntime,
      logger: noopLogger,
      resolvePath: (input) => input,
      handlers: {
        registerCli(registrar, opts) {
          const descriptors = (opts?.descriptors ?? [])
            .map((descriptor) => ({
              name: descriptor.name.trim(),
              description: descriptor.description.trim(),
              hasSubcommands: descriptor.hasSubcommands,
            }))
            .filter((descriptor) => descriptor.name && descriptor.description);
          const commands = [
            ...(opts?.commands ?? []),
            ...descriptors.map((descriptor) => descriptor.name),
          ]
            .map((command) => command.trim())
            .filter(Boolean);
          if (commands.length === 0) {
            return;
          }
          cliRegistrars.push({
            register: registrar,
            commands,
            descriptors,
          });
        },
        registerProvider(provider: ProviderPlugin) {
          providers.push(provider);
        },
        registerAgentHarness(harness: AgentHarness) {
          agentHarnesses.push(harness);
        },
        registerCliBackend(backend: CliBackendPlugin) {
          cliBackends.push(backend);
        },
        registerTextTransforms(transforms: PluginTextTransformRegistration) {
          textTransforms.push(transforms);
        },
        registerSpeechProvider(provider: SpeechProviderPlugin) {
          speechProviders.push(provider);
        },
        registerRealtimeTranscriptionProvider(provider: RealtimeTranscriptionProviderPlugin) {
          realtimeTranscriptionProviders.push(provider);
        },
        registerRealtimeVoiceProvider(provider: RealtimeVoiceProviderPlugin) {
          realtimeVoiceProviders.push(provider);
        },
        registerMediaUnderstandingProvider(provider: MediaUnderstandingProviderPlugin) {
          mediaUnderstandingProviders.push(provider);
        },
        registerImageGenerationProvider(provider: ImageGenerationProviderPlugin) {
          imageGenerationProviders.push(provider);
        },
        registerVideoGenerationProvider(provider: VideoGenerationProviderPlugin) {
          videoGenerationProviders.push(provider);
        },
        registerMusicGenerationProvider(provider: MusicGenerationProviderPlugin) {
          musicGenerationProviders.push(provider);
        },
        registerWebFetchProvider(provider: WebFetchProviderPlugin) {
          webFetchProviders.push(provider);
        },
        registerWebSearchProvider(provider: WebSearchProviderPlugin) {
          webSearchProviders.push(provider);
        },
        registerMemoryEmbeddingProvider(adapter: MemoryEmbeddingProviderAdapter) {
          memoryEmbeddingProviders.push(adapter);
        },
        registerMigrationProvider(provider: MigrationProviderPlugin) {
          migrationProviders.push(provider);
        },
        registerTool(tool) {
          if (typeof tool !== "function") {
            tools.push(tool);
          }
        },
      },
    }),
  };
}

export function capturePluginRegistration(params: {
  register(api: EnclawedPluginApi): void;
}): CapturedPluginRegistration {
  const captured = createCapturedPluginRegistration();
  params.register(captured.api);
  return captured;
}
