import {
  createGoogleThinkingPayloadWrapper,
  sanitizeGoogleThinkingPayload,
} from "../agents/pi-embedded-runner/google-stream-wrappers.js";
import {
  createCodexNativeWebSearchWrapper,
  createOpenAIAttributionHeadersWrapper,
  createOpenAIFastModeWrapper,
  createOpenAIReasoningCompatibilityWrapper,
  createOpenAIResponsesContextManagementWrapper,
  createOpenAIServiceTierWrapper,
  createOpenAITextVerbosityWrapper,
  resolveOpenAIFastMode,
  resolveOpenAIServiceTier,
  resolveOpenAITextVerbosity,
} from "../agents/pi-embedded-runner/openai-stream-wrappers.js";
import {
  createKilocodeWrapper,
  createOpenRouterSystemCacheWrapper,
  createOpenRouterWrapper,
  isProxyReasoningUnsupported,
} from "../agents/pi-embedded-runner/proxy-stream-wrappers.js";
import type { ProviderPlugin } from "../plugins/types.js";
import type { ProviderWrapStreamFnContext } from "./plugin-entry.js";
import { createToolStreamWrapper } from "./provider-stream-shared.js";
export {
  applyAnthropicEphemeralCacheControlMarkers,
  applyAnthropicPayloadPolicyToParams,
  buildCopilotDynamicHeaders,
  composeProviderStreamWrappers,
  createBedrockNoCacheWrapper,
  createMoonshotThinkingWrapper,
  createToolStreamWrapper,
  defaultToolStreamExtraParams,
  hasCopilotVisionInput,
  isAnthropicBedrockModel,
  type ProviderStreamWrapperFactory,
  resolveAnthropicPayloadPolicy,
  resolveMoonshotThinkingType,
  streamWithPayloadPatch,
} from "./provider-stream-shared.js";

export type ProviderStreamFamily =
  | "google-thinking"
  | "kilocode-thinking"
  | "openai-responses-defaults"
  | "openrouter-thinking"
  | "tool-stream-default-on";

type ProviderStreamFamilyHooks = Pick<ProviderPlugin, "wrapStreamFn">;

export function buildProviderStreamFamilyHooks(
  family: ProviderStreamFamily,
): ProviderStreamFamilyHooks {
  switch (family) {
    case "google-thinking":
      return {
        wrapStreamFn: (ctx: ProviderWrapStreamFnContext) =>
          createGoogleThinkingPayloadWrapper(ctx.streamFn, ctx.thinkingLevel),
      };
    case "kilocode-thinking":
      return {
        wrapStreamFn: (ctx: ProviderWrapStreamFnContext) => {
          const thinkingLevel =
            ctx.modelId === "kilo/auto" || isProxyReasoningUnsupported(ctx.modelId)
              ? undefined
              : ctx.thinkingLevel;
          return createKilocodeWrapper(ctx.streamFn, thinkingLevel);
        },
      };
    case "openai-responses-defaults":
      return {
        wrapStreamFn: (ctx: ProviderWrapStreamFnContext) => {
          let nextStreamFn = createOpenAIAttributionHeadersWrapper(ctx.streamFn);

          if (resolveOpenAIFastMode(ctx.extraParams)) {
            nextStreamFn = createOpenAIFastModeWrapper(nextStreamFn);
          }

          const serviceTier = resolveOpenAIServiceTier(ctx.extraParams);
          if (serviceTier) {
            nextStreamFn = createOpenAIServiceTierWrapper(nextStreamFn, serviceTier);
          }

          const textVerbosity = resolveOpenAITextVerbosity(ctx.extraParams);
          if (textVerbosity) {
            nextStreamFn = createOpenAITextVerbosityWrapper(nextStreamFn, textVerbosity);
          }

          nextStreamFn = createCodexNativeWebSearchWrapper(nextStreamFn, {
            config: ctx.config,
            agentDir: ctx.agentDir,
          });
          return createOpenAIResponsesContextManagementWrapper(
            createOpenAIReasoningCompatibilityWrapper(nextStreamFn),
            ctx.extraParams,
          );
        },
      };
    case "openrouter-thinking":
      return {
        wrapStreamFn: (ctx: ProviderWrapStreamFnContext) => {
          const thinkingLevel =
            ctx.modelId === "auto" || isProxyReasoningUnsupported(ctx.modelId)
              ? undefined
              : ctx.thinkingLevel;
          return createOpenRouterWrapper(ctx.streamFn, thinkingLevel);
        },
      };
    case "tool-stream-default-on":
      return {
        wrapStreamFn: (ctx: ProviderWrapStreamFnContext) =>
          createToolStreamWrapper(ctx.streamFn, ctx.extraParams?.tool_stream !== false),
      };
  }
  throw new Error("Unsupported provider stream family");
}

export const GOOGLE_THINKING_STREAM_HOOKS = buildProviderStreamFamilyHooks("google-thinking");
export const KILOCODE_THINKING_STREAM_HOOKS = buildProviderStreamFamilyHooks("kilocode-thinking");
export const OPENAI_RESPONSES_STREAM_HOOKS = buildProviderStreamFamilyHooks(
  "openai-responses-defaults",
);
export const OPENROUTER_THINKING_STREAM_HOOKS =
  buildProviderStreamFamilyHooks("openrouter-thinking");
export const TOOL_STREAM_DEFAULT_ON_HOOKS =
  buildProviderStreamFamilyHooks("tool-stream-default-on");

// Public stream-wrapper helpers for provider plugins.

export {
  createAnthropicToolPayloadCompatibilityWrapper,
  createOpenAIAnthropicToolPayloadCompatibilityWrapper,
} from "../agents/pi-embedded-runner/anthropic-family-tool-payload-compat.js";
export {
  createGoogleThinkingPayloadWrapper,
  sanitizeGoogleThinkingPayload,
} from "../agents/pi-embedded-runner/google-stream-wrappers.js";
export {
  createKilocodeWrapper,
  createOpenRouterSystemCacheWrapper,
  createOpenRouterWrapper,
  isProxyReasoningUnsupported,
} from "../agents/pi-embedded-runner/proxy-stream-wrappers.js";
export {
  createOpenAIAttributionHeadersWrapper,
  createCodexNativeWebSearchWrapper,
  createOpenAIDefaultTransportWrapper,
  createOpenAIFastModeWrapper,
  createOpenAIReasoningCompatibilityWrapper,
  createOpenAIResponsesContextManagementWrapper,
  createOpenAIServiceTierWrapper,
  createOpenAITextVerbosityWrapper,
  resolveOpenAIFastMode,
  resolveOpenAIServiceTier,
  resolveOpenAITextVerbosity,
} from "../agents/pi-embedded-runner/openai-stream-wrappers.js";
export {
  getOpenRouterModelCapabilities,
  loadOpenRouterModelCapabilities,
} from "../agents/pi-embedded-runner/openrouter-model-capabilities.js";
