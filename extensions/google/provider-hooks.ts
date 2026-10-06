import type {
  ProviderThinkingPolicyContext,
  ProviderThinkingProfile,
} from "@enclawed/plugin-sdk/core";
import { buildProviderReplayFamilyHooks } from "@enclawed/plugin-sdk/provider-model-shared";
import { createGoogleThinkingStreamWrapper, isGoogleGemini3ProModel } from "./thinking-api.js";

export const GOOGLE_GEMINI_PROVIDER_HOOKS = {
  ...buildProviderReplayFamilyHooks({
    family: "google-gemini",
  }),
  resolveThinkingProfile: ({ modelId }: ProviderThinkingPolicyContext) =>
    ({
      levels: isGoogleGemini3ProModel(modelId)
        ? [{ id: "off" }, { id: "low" }, { id: "adaptive" }, { id: "high" }]
        : [
            { id: "off" },
            { id: "minimal" },
            { id: "low" },
            { id: "medium" },
            { id: "adaptive" },
            { id: "high" },
          ],
    }) satisfies ProviderThinkingProfile,
  wrapStreamFn: createGoogleThinkingStreamWrapper,
};
