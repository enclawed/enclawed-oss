import type { Api, Context, Model, ProviderStreamOptions } from "@mariozechner/pi-ai";
import { complete } from "@mariozechner/pi-ai/compat";
import { getApiKeyForModel, requireApiKey } from "../agents/model-auth.js";
import { findNormalizedProviderValue, normalizeModelRef } from "../agents/model-selection.js";
import { ensureEnclawedModelsJson } from "../agents/models-config.js";
import { withEnclawedClientIdentity } from "../agents/pi-client-identity.js";
import { resolveModelWithRegistry } from "../agents/pi-embedded-runner/model.js";
import { resolveProviderRequestCapabilities } from "../agents/provider-attribution.js";
import { registerProviderStreamForModel } from "../agents/provider-stream.js";
import {
  coerceImageAssistantText,
  hasImageReasoningOnlyResponse,
} from "../agents/tools/image-tool.helpers.js";
import { prepareProviderDynamicModel } from "../plugins/provider-runtime.js";
import type {
  ImageDescriptionRequest,
  ImageDescriptionResult,
  ImagesDescriptionRequest,
  ImagesDescriptionResult,
} from "./types.js";

let piModelDiscoveryRuntimePromise: Promise<
  typeof import("../agents/pi-model-discovery-runtime.js")
> | null = null;

function loadPiModelDiscoveryRuntime() {
  piModelDiscoveryRuntimePromise ??= import("../agents/pi-model-discovery-runtime.js");
  return piModelDiscoveryRuntimePromise;
}

function resolveImageToolMaxTokens(modelMaxTokens: number | undefined, requestedMaxTokens = 4096) {
  if (
    typeof modelMaxTokens !== "number" ||
    !Number.isFinite(modelMaxTokens) ||
    modelMaxTokens <= 0
  ) {
    return requestedMaxTokens;
  }
  return Math.min(requestedMaxTokens, modelMaxTokens);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNativeResponsesReasoningPayload(model: Model<Api>): boolean {
  if (
    model.api !== "openai-responses" &&
    model.api !== "azure-openai-responses" &&
    model.api !== "openai-codex-responses"
  ) {
    return false;
  }
  return resolveProviderRequestCapabilities({
    provider: model.provider,
    api: model.api,
    baseUrl: model.baseUrl,
    capability: "image",
    transport: "media-understanding",
  }).usesKnownNativeOpenAIRoute;
}

function formatModelInputCapabilities(input: Model<Api>["input"] | undefined): string {
  return input && input.length > 0 ? input.join(", ") : "none";
}

function removeReasoningInclude(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }
  const next = value.filter((entry) => entry !== "reasoning.encrypted_content");
  return next.length > 0 ? next : undefined;
}

function disableReasoningForImageRetryPayload(payload: unknown, model: Model<Api>): unknown {
  if (!isRecord(payload)) {
    return undefined;
  }
  const next = { ...payload };
  delete next.reasoning;
  delete next.reasoning_effort;

  const include = removeReasoningInclude(next.include);
  if (include === undefined) {
    delete next.include;
  } else {
    next.include = include;
  }

  if (isNativeResponsesReasoningPayload(model)) {
    next.reasoning = { effort: "none" };
  }
  return next;
}

function isImageModelNoTextError(err: unknown): boolean {
  return err instanceof Error && /^Image model returned no text\b/.test(err.message);
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return Boolean(value) && typeof (value as { then?: unknown }).then === "function";
}

function composeImageDescriptionPayloadHandlers(
  first: ProviderStreamOptions["onPayload"] | undefined,
  second: ProviderStreamOptions["onPayload"] | undefined,
): ProviderStreamOptions["onPayload"] | undefined {
  if (!first) {
    return second;
  }
  if (!second) {
    return first;
  }
  return (payload, payloadModel) => {
    const runSecond = (firstResult: unknown) => {
      const nextPayload = firstResult === undefined ? payload : firstResult;
      const secondResult = second(nextPayload, payloadModel);
      const coerceResult = (resolvedSecond: unknown) =>
        resolvedSecond === undefined ? firstResult : resolvedSecond;
      return isPromiseLike(secondResult)
        ? Promise.resolve(secondResult).then(coerceResult)
        : coerceResult(secondResult);
    };
    const firstResult = first(payload, payloadModel);
    if (isPromiseLike(firstResult)) {
      return Promise.resolve(firstResult).then(runSecond);
    }
    return runSecond(firstResult);
  };
}

async function resolveImageRuntime(params: {
  cfg: ImageDescriptionRequest["cfg"];
  agentDir: string;
  provider: string;
  model: string;
  profile?: string;
  preferredProfile?: string;
  authStore?: ImageDescriptionRequest["authStore"];
}): Promise<{ apiKey: string; model: Model<Api> }> {
  await ensureEnclawedModelsJson(params.cfg, params.agentDir);
  const { discoverAuthStorage, discoverModels } = await loadPiModelDiscoveryRuntime();
  const authStorage = discoverAuthStorage(params.agentDir);
  const modelRegistry = await discoverModels(authStorage, params.agentDir);
  const resolvedRef = normalizeModelRef(params.provider, params.model);
  const configuredProviders = params.cfg.models?.providers;
  const providerConfig =
    configuredProviders?.[resolvedRef.provider] ??
    findNormalizedProviderValue(configuredProviders, resolvedRef.provider);
  // Fast path: resolve without dynamic model preparation first.
  // This avoids unnecessary prepare hooks (e.g. OpenRouter catalog fetch)
  // for models that are already explicitly resolvable.
  let model = resolveModelWithRegistry({
    provider: resolvedRef.provider,
    modelId: resolvedRef.model,
    modelRegistry,
    cfg: params.cfg,
    agentDir: params.agentDir,
  }) as Model<Api> | null;

  // If the model is not in the registry yet, prepare dynamic provider models
  // and retry (needed for provider-runtime-backed dynamic models).
  if (!model) {
    await prepareProviderDynamicModel({
      provider: resolvedRef.provider,
      config: params.cfg,
      context: {
        config: params.cfg,
        agentDir: params.agentDir,
        provider: resolvedRef.provider,
        modelId: resolvedRef.model,
        modelRegistry,
        providerConfig,
      },
    });
    model = resolveModelWithRegistry({
      provider: resolvedRef.provider,
      modelId: resolvedRef.model,
      modelRegistry,
      cfg: params.cfg,
      agentDir: params.agentDir,
    }) as Model<Api> | null;
  }
  if (!model) {
    throw new Error(`Unknown model: ${resolvedRef.provider}/${resolvedRef.model}`);
  }
  if (!model.input?.includes("image")) {
    throw new Error(
      `Model does not support images: ${params.provider}/${params.model} ` +
        `(resolved ${model.provider}/${model.id} input: ${formatModelInputCapabilities(model.input)})`,
    );
  }
  const apiKeyInfo = await getApiKeyForModel({
    model,
    cfg: params.cfg,
    agentDir: params.agentDir,
    profileId: params.profile,
    preferredProfile: params.preferredProfile,
    store: params.authStore,
  });
  const apiKey = requireApiKey(apiKeyInfo, model.provider);
  authStorage.setRuntimeApiKey(model.provider, apiKey);
  return { apiKey, model };
}

function buildImageContext(
  prompt: string,
  images: Array<{ buffer: Buffer; mime?: string }>,
  opts?: { promptInUserContent?: boolean },
): Context {
  const imageContent = images.map((image) => ({
    type: "image" as const,
    data: image.buffer.toString("base64"),
    mimeType: image.mime ?? "image/jpeg",
  }));
  const content = opts?.promptInUserContent
    ? [{ type: "text" as const, text: prompt }, ...imageContent]
    : imageContent;

  return {
    ...(opts?.promptInUserContent ? {} : { systemPrompt: prompt }),
    messages: [
      {
        role: "user",
        content,
        timestamp: Date.now(),
      },
    ],
  };
}

function shouldPlaceImagePromptInUserContent(model: Model<Api>): boolean {
  const capabilities = resolveProviderRequestCapabilities({
    provider: model.provider,
    api: model.api,
    baseUrl: model.baseUrl,
    capability: "image",
    transport: "media-understanding",
  });
  return (
    capabilities.endpointClass === "openrouter" ||
    (model.provider.toLowerCase() === "openrouter" && capabilities.endpointClass === "default")
  );
}

function resolveImageDescriptionTimeoutMs(timeoutMs: number | undefined, startedAtMs: number) {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return undefined;
  }
  return Math.max(1, Math.floor(timeoutMs - (Date.now() - startedAtMs)));
}

async function withImageDescriptionTimeout<T>(params: {
  task: Promise<T>;
  timeoutMs: number | undefined;
  controller: AbortController;
}): Promise<T> {
  if (params.timeoutMs === undefined) {
    return await params.task;
  }
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      params.task,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          params.controller.abort();
          reject(new Error(`image description timed out after ${params.timeoutMs}ms`));
        }, params.timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function describeImagesWithModelInternal(
  params: ImagesDescriptionRequest,
  options: { onPayload?: ProviderStreamOptions["onPayload"] } = {},
): Promise<ImagesDescriptionResult> {
  const prompt = params.prompt ?? "Describe the image.";
  const startedAtMs = Date.now();
  const controller = new AbortController();
  const { apiKey, model } = await withImageDescriptionTimeout({
    controller,
    timeoutMs: resolveImageDescriptionTimeoutMs(params.timeoutMs, startedAtMs),
    task: resolveImageRuntime(params),
  });

  registerProviderStreamForModel({
    model,
    cfg: params.cfg,
    agentDir: params.agentDir,
  });

  const context = buildImageContext(prompt, params.images, {
    promptInUserContent: shouldPlaceImagePromptInUserContent(model),
  });

  const maxTokens = resolveImageToolMaxTokens(model.maxTokens, params.maxTokens ?? 512);
  const completeImage = async (onPayload?: ProviderStreamOptions["onPayload"]) => {
    const payloadHandler = composeImageDescriptionPayloadHandlers(onPayload, options.onPayload);
    const timeoutMs = resolveImageDescriptionTimeoutMs(params.timeoutMs, startedAtMs);
    return await withImageDescriptionTimeout({
      controller,
      timeoutMs,
      task: complete(
        model,
        context,
        withEnclawedClientIdentity({
          apiKey,
          maxTokens,
          signal: controller.signal,
          ...(timeoutMs !== undefined ? { timeoutMs } : {}),
          ...(payloadHandler ? { onPayload: payloadHandler } : {}),
        }),
      ),
    });
  };

  const message = await completeImage();
  try {
    const text = coerceImageAssistantText({
      message,
      provider: model.provider,
      model: model.id,
    });
    return { text, model: model.id };
  } catch (err) {
    if (!isImageModelNoTextError(err) || !hasImageReasoningOnlyResponse(message)) {
      throw err;
    }
  }

  const retryMessage = await completeImage(disableReasoningForImageRetryPayload);
  const text = coerceImageAssistantText({
    message: retryMessage,
    provider: model.provider,
    model: model.id,
  });
  return { text, model: model.id };
}

export async function describeImagesWithModel(
  params: ImagesDescriptionRequest,
): Promise<ImagesDescriptionResult> {
  return await describeImagesWithModelInternal(params);
}

export async function describeImagesWithModelPayloadTransform(
  params: ImagesDescriptionRequest,
  onPayload: ProviderStreamOptions["onPayload"],
): Promise<ImagesDescriptionResult> {
  return await describeImagesWithModelInternal(params, { onPayload });
}

export async function describeImageWithModel(
  params: ImageDescriptionRequest,
): Promise<ImageDescriptionResult> {
  return await describeImagesWithModel({
    images: [
      {
        buffer: params.buffer,
        fileName: params.fileName,
        mime: params.mime,
      },
    ],
    model: params.model,
    provider: params.provider,
    prompt: params.prompt,
    maxTokens: params.maxTokens,
    timeoutMs: params.timeoutMs,
    profile: params.profile,
    preferredProfile: params.preferredProfile,
    authStore: params.authStore,
    agentDir: params.agentDir,
    cfg: params.cfg,
  });
}

export async function describeImageWithModelPayloadTransform(
  params: ImageDescriptionRequest,
  onPayload: ProviderStreamOptions["onPayload"],
): Promise<ImageDescriptionResult> {
  return await describeImagesWithModelPayloadTransform(
    {
      images: [
        {
          buffer: params.buffer,
          fileName: params.fileName,
          mime: params.mime,
        },
      ],
      model: params.model,
      provider: params.provider,
      prompt: params.prompt,
      maxTokens: params.maxTokens,
      timeoutMs: params.timeoutMs,
      profile: params.profile,
      preferredProfile: params.preferredProfile,
      authStore: params.authStore,
      agentDir: params.agentDir,
      cfg: params.cfg,
    },
    onPayload,
  );
}
