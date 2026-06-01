import type { OpenAICompletionsCompat } from "@mariozechner/pi-ai";
import type { ConfiguredModelProviderRequest } from "./types.provider-request.js";
import type { SecretInput } from "./types.secrets.js";
export declare const MODEL_APIS: readonly ["openai-completions", "openai-responses", "openai-codex-responses", "anthropic-messages", "google-generative-ai", "github-copilot", "bedrock-converse-stream", "ollama", "azure-openai-responses"];
export type ModelApi = (typeof MODEL_APIS)[number];
type SupportedOpenAICompatFields = Pick<OpenAICompletionsCompat, "supportsStore" | "supportsDeveloperRole" | "supportsReasoningEffort" | "supportsUsageInStreaming" | "supportsStrictMode" | "maxTokensField" | "requiresToolResultName" | "requiresAssistantAfterToolResult" | "requiresThinkingAsText">;
type SupportedThinkingFormat = NonNullable<OpenAICompletionsCompat["thinkingFormat"]> | "openrouter" | "qwen-chat-template";
export type ModelCompatConfig = SupportedOpenAICompatFields & {
    thinkingFormat?: SupportedThinkingFormat;
    supportsTools?: boolean;
    supportsPromptCacheKey?: boolean;
    requiresStringContent?: boolean;
    toolSchemaProfile?: string;
    unsupportedToolSchemaKeywords?: string[];
    nativeWebSearchTool?: boolean;
    toolCallArgumentsEncoding?: string;
    requiresMistralToolIds?: boolean;
    requiresOpenAiAnthropicToolPayload?: boolean;
    /** Reasoning-effort levels supported by this model (for providers with a discrete ladder). */
    supportedReasoningEfforts?: readonly string[];
    /** Map from canonical reasoning-effort level to a provider-specific value. */
    reasoningEffortMap?: Readonly<Record<string, string>>;
};
export type ModelProviderAuthMode = "api-key" | "aws-sdk" | "oauth" | "token";
export type ModelDefinitionConfig = {
    id: string;
    name: string;
    api?: ModelApi;
    baseUrl?: string;
    reasoning: boolean;
    input: Array<"text" | "image" | "video" | "audio">;
    cost: {
        input: number;
        output: number;
        cacheRead: number;
        cacheWrite: number;
        /** Optional tiered pricing. When present, cost calculation uses
         *  per-tier rates instead of the flat rates above. Prices are
         *  USD / million tokens; ranges are half-open `[start, end)` on the
         *  input-token axis. */
        tieredPricing?: Array<{
            input: number;
            output: number;
            cacheRead: number;
            cacheWrite: number;
            /** Bounded tier: `[start, end)`. Open-ended top tier: `[start]`. */
            range: [number, number] | [number];
        }>;
    };
    contextWindow: number;
    /**
     * Optional effective runtime cap used for compaction/session budgeting.
     * Keeps provider/native contextWindow metadata intact while letting configs
     * prefer a smaller practical window.
     */
    contextTokens?: number;
    maxTokens: number;
    headers?: Record<string, string>;
    compat?: ModelCompatConfig;
};
export type ModelProviderConfig = {
    baseUrl: string;
    apiKey?: SecretInput;
    auth?: ModelProviderAuthMode;
    api?: ModelApi;
    injectNumCtxForOpenAICompat?: boolean;
    headers?: Record<string, SecretInput>;
    authHeader?: boolean;
    request?: ConfiguredModelProviderRequest;
    models: ModelDefinitionConfig[];
};
export type BedrockDiscoveryConfig = {
    enabled?: boolean;
    region?: string;
    providerFilter?: string[];
    refreshInterval?: number;
    defaultContextWindow?: number;
    defaultMaxTokens?: number;
};
export type DiscoveryToggleConfig = {
    enabled?: boolean;
};
export type ModelsConfig = {
    mode?: "merge" | "replace";
    providers?: Record<string, ModelProviderConfig>;
    bedrockDiscovery?: BedrockDiscoveryConfig;
    copilotDiscovery?: DiscoveryToggleConfig;
    huggingfaceDiscovery?: DiscoveryToggleConfig;
    ollamaDiscovery?: DiscoveryToggleConfig;
};
export {};
