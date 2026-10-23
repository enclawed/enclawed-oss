import { type Api, type Model } from "@mariozechner/pi-ai";
import type { EnclawedConfig } from "../config/types.enclawed.js";
import { type AuthProfileStore } from "./auth-profiles.js";
import { type ResolvedProviderAuth } from "./model-auth-runtime-shared.js";
export { ensureAuthProfileStore, resolveAuthProfileOrder } from "./auth-profiles.js";
export { requireApiKey, resolveAwsSdkEnvVarName } from "./model-auth-runtime-shared.js";
export type { ResolvedProviderAuth } from "./model-auth-runtime-shared.js";
export type ProviderCredentialPrecedence = "profile-first" | "env-first";
export declare function getCustomProviderApiKey(cfg: EnclawedConfig | undefined, provider: string): string | undefined;
type ResolvedCustomProviderApiKey = {
    apiKey: string;
    source: string;
};
export declare function resolveUsableCustomProviderApiKey(params: {
    cfg: EnclawedConfig | undefined;
    provider: string;
    env?: NodeJS.ProcessEnv;
}): ResolvedCustomProviderApiKey | null;
export declare function hasUsableCustomProviderApiKey(cfg: EnclawedConfig | undefined, provider: string, env?: NodeJS.ProcessEnv): boolean;
export declare function shouldPreferExplicitConfigApiKeyAuth(cfg: EnclawedConfig | undefined, provider: string): boolean;
export declare function resolveApiKeyForProvider(params: {
    provider: string;
    cfg?: EnclawedConfig;
    profileId?: string;
    preferredProfile?: string;
    store?: AuthProfileStore;
    agentDir?: string;
    /** When true, treat profileId as a user-locked selection that must not be
     *  silently overridden by env/config credentials (e.g. ollama-local). */
    lockedProfile?: boolean;
    credentialPrecedence?: ProviderCredentialPrecedence;
}): Promise<ResolvedProviderAuth>;
export type ModelAuthMode = "api-key" | "oauth" | "token" | "mixed" | "aws-sdk" | "unknown";
export { resolveEnvApiKey } from "./model-auth-env.js";
export type { EnvApiKeyResult } from "./model-auth-env.js";
export declare function resolveModelAuthMode(provider?: string, cfg?: EnclawedConfig, store?: AuthProfileStore, options?: {
    workspaceDir?: string;
}): ModelAuthMode | undefined;
export declare function hasAvailableAuthForProvider(params: {
    provider: string;
    cfg?: EnclawedConfig;
    preferredProfile?: string;
    store?: AuthProfileStore;
    agentDir?: string;
}): Promise<boolean>;
export declare function getApiKeyForModel(params: {
    model: Model<Api>;
    cfg?: EnclawedConfig;
    profileId?: string;
    preferredProfile?: string;
    store?: AuthProfileStore;
    agentDir?: string;
    lockedProfile?: boolean;
    credentialPrecedence?: ProviderCredentialPrecedence;
}): Promise<ResolvedProviderAuth>;
export declare function applyLocalNoAuthHeaderOverride<T extends Model<Api>>(model: T, auth: ResolvedProviderAuth | null | undefined): T;
/**
 * When the provider config sets `authHeader: true`, inject an explicit
 * `Authorization: Bearer <apiKey>` header into the model so downstream SDKs
 * (e.g. `@google/genai`) send credentials via the standard HTTP Authorization
 * header instead of vendor-specific headers like `x-goog-api-key`.
 *
 * This is a no-op when `authHeader` is not `true`, when no API key is
 * available, or when the API key is a synthetic marker (e.g. local-server
 * placeholders) rather than a real credential.
 */
export declare function applyAuthHeaderOverride<T extends Model<Api>>(model: T, auth: ResolvedProviderAuth | null | undefined, cfg: EnclawedConfig | undefined): T;
