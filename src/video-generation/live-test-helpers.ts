import type { EnclawedConfig } from "../config/types.js";
import {
  parseLiveCsvFilter,
  parseProviderModelMap,
  redactLiveApiKey,
  resolveConfiguredLiveProviderModels,
  resolveLiveAuthStore,
} from "../media-generation/live-test-helpers.js";
import { normalizeLowercaseStringOrEmpty } from "../shared/string-coerce.js";

export { parseProviderModelMap, redactLiveApiKey };

export const DEFAULT_LIVE_VIDEO_MODELS: Record<string, string> = {
  fal: "fal/fal-ai/minimax/video-01-live",
  google: "google/veo-3.1-fast-generate-preview",
  openai: "openai/sora-2",
  runway: "runway/gen4.5",
  together: "together/Wan-AI/Wan2.2-T2V-A14B",
  vydra: "vydra/veo3",
  xai: "xai/grok-imagine-video",
};

const REMOTE_URL_VIDEO_TO_VIDEO_PROVIDERS = new Set(["google", "openai", "xai"]);
const BUFFER_BACKED_IMAGE_TO_VIDEO_UNSUPPORTED_PROVIDERS = new Set(["vydra"]);

// Every bundled live video provider accepts 480P, the cheapest live-lane
// resolution. The params stay so plugin live tests keep a stable signature.
export function resolveLiveVideoResolution(_params: {
  providerId: string;
  modelRef: string;
}): "480P" | "768P" | "1080P" {
  return "480P";
}

export function parseCsvFilter(raw?: string): Set<string> | null {
  return parseLiveCsvFilter(raw);
}

export function resolveConfiguredLiveVideoModels(cfg: EnclawedConfig): Map<string, string> {
  return resolveConfiguredLiveProviderModels(cfg.agents?.defaults?.videoGenerationModel);
}

export function canRunBufferBackedVideoToVideoLiveLane(params: {
  providerId: string;
  modelRef: string;
}): boolean {
  const providerId = normalizeLowercaseStringOrEmpty(params.providerId);
  if (REMOTE_URL_VIDEO_TO_VIDEO_PROVIDERS.has(providerId)) {
    return false;
  }
  if (providerId !== "runway") {
    return true;
  }
  const slash = params.modelRef.indexOf("/");
  const model =
    slash <= 0 || slash === params.modelRef.length - 1
      ? params.modelRef.trim()
      : params.modelRef.slice(slash + 1).trim();
  return model === "gen4_aleph";
}

export function canRunBufferBackedImageToVideoLiveLane(params: {
  providerId: string;
  modelRef: string;
}): boolean {
  const providerId = normalizeLowercaseStringOrEmpty(params.providerId);
  if (BUFFER_BACKED_IMAGE_TO_VIDEO_UNSUPPORTED_PROVIDERS.has(providerId)) {
    return false;
  }
  return true;
}

export function resolveLiveVideoAuthStore(params: {
  requireProfileKeys: boolean;
  hasLiveKeys: boolean;
}) {
  return resolveLiveAuthStore(params);
}
