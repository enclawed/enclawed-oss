import { describePluginRegistrationContract } from "./plugin-registration-contract.js";

type PluginRegistrationContractParams = Parameters<typeof describePluginRegistrationContract>[0];

export const pluginRegistrationContractCases = {
  anthropic: {
    pluginId: "anthropic",
    providerIds: ["anthropic"],
    mediaUnderstandingProviderIds: ["anthropic"],
    cliBackendIds: ["claude-cli"],
    requireDescribeImages: true,
  },
  brave: {
    pluginId: "brave",
    webSearchProviderIds: ["brave"],
  },
  comfy: {
    pluginId: "comfy",
    providerIds: ["comfy"],
    imageGenerationProviderIds: ["comfy"],
    musicGenerationProviderIds: ["comfy"],
    videoGenerationProviderIds: ["comfy"],
    requireGenerateImage: true,
    requireGenerateVideo: true,
  },
  deepgram: {
    pluginId: "deepgram",
    mediaUnderstandingProviderIds: ["deepgram"],
  },
  duckduckgo: {
    pluginId: "duckduckgo",
    webSearchProviderIds: ["duckduckgo"],
  },
  elevenlabs: {
    pluginId: "elevenlabs",
    speechProviderIds: ["elevenlabs"],
    requireSpeechVoices: true,
  },
  exa: {
    pluginId: "exa",
    webSearchProviderIds: ["exa"],
  },
  fal: {
    pluginId: "fal",
    providerIds: ["fal"],
    imageGenerationProviderIds: ["fal"],
  },
  firecrawl: {
    pluginId: "firecrawl",
    webFetchProviderIds: ["firecrawl"],
    webSearchProviderIds: ["firecrawl"],
    toolNames: ["firecrawl_search", "firecrawl_scrape"],
  },
  google: {
    pluginId: "google",
    providerIds: ["google", "google-gemini-cli"],
    webSearchProviderIds: ["gemini"],
    speechProviderIds: ["google"],
    mediaUnderstandingProviderIds: ["google"],
    imageGenerationProviderIds: ["google"],
    requireDescribeImages: true,
    requireGenerateImage: true,
  },
  groq: {
    pluginId: "groq",
    mediaUnderstandingProviderIds: ["groq"],
  },
  microsoft: {
    pluginId: "microsoft",
    speechProviderIds: ["microsoft"],
    requireSpeechVoices: true,
  },
  mistral: {
    pluginId: "mistral",
    mediaUnderstandingProviderIds: ["mistral"],
  },
  openai: {
    pluginId: "openai",
    providerIds: ["openai", "openai-codex"],
    speechProviderIds: ["openai"],
    realtimeTranscriptionProviderIds: ["openai"],
    realtimeVoiceProviderIds: ["openai"],
    mediaUnderstandingProviderIds: ["openai", "openai-codex"],
    imageGenerationProviderIds: ["openai"],
    requireSpeechVoices: true,
    requireDescribeImages: true,
    requireGenerateImage: true,
  },
  openrouter: {
    pluginId: "openrouter",
    providerIds: ["openrouter"],
    mediaUnderstandingProviderIds: ["openrouter"],
    requireDescribeImages: true,
  },
  perplexity: {
    pluginId: "perplexity",
    webSearchProviderIds: ["perplexity"],
  },
  tavily: {
    pluginId: "tavily",
    webSearchProviderIds: ["tavily"],
    toolNames: ["tavily_search", "tavily_extract"],
  },
  xai: {
    pluginId: "xai",
    providerIds: ["xai"],
    webSearchProviderIds: ["grok"],
  },
} satisfies Record<string, PluginRegistrationContractParams>;
