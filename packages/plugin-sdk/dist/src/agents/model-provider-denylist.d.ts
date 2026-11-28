/**
 * Enclawed policy: model providers that are based in, or host inference in,
 * the People's Republic of China are never supported. This is the single
 * enclawed-side boundary for that rule. It covers both the providers that
 * used to ship as bundled plugins and the providers that the upstream
 * pi-ai built-in catalog still ships (deepseek, kimi-coding, minimax,
 * moonshotai, qwen-token-plan, xiaomi, zai, ant-ling, and their `-cn` and
 * regional variants).
 *
 * The rule is enforced at these seams, all through this module:
 * - `model-suppression.ts`: built-in model suppression, which the model
 *   catalog, `enclawed models list`, onboarding pickers, and model
 *   resolution (`resolveModel` / `resolveModelAsync`) already consult.
 * - `pi-model-discovery.ts`: the pi `ModelRegistry` wrapper filters
 *   `getAll` / `getAvailable` and refuses `find` for denied providers.
 * - `models-config.plan.ts`: denied providers never reach `models.json`.
 * - `pi-model-discovery.ts` `addEnvBackedPiCredentials`: env keys for denied
 *   providers are never mirrored into pi auth storage.
 *
 * The rule is keyed on provider ids and endpoint hosts, never on model
 * families: open-weight models (Qwen, DeepSeek, GLM, Kimi, MiniMax, ...)
 * served by kept providers (Ollama, vLLM, SGLang, OpenRouter, Together,
 * Fireworks, Bedrock, ...) stay available.
 */
/**
 * Credential env var names of denied providers (from the removed bundled
 * plugins and pi-ai's built-in catalog). They are never read for auth; they
 * are listed so secret hygiene (for example stripping provider credentials
 * from ACP child processes) still removes them if an old shell exports them.
 */
export declare const DENIED_PROVIDER_SECRET_ENV_VARS: readonly string[];
/** True when the provider id names a provider Enclawed never supports. */
export declare function isDeniedModelProvider(provider: string | null | undefined): boolean;
/** True when the endpoint URL (or bare host) belongs to a denied provider. */
export declare function isDeniedModelProviderEndpoint(baseUrl: string | null | undefined): boolean;
/** True when either the provider id or its endpoint is denied. */
export declare function isDeniedModelProviderRef(params: {
    provider?: string | null;
    baseUrl?: string | null;
}): boolean;
export declare function buildDeniedModelProviderError(provider: string | null | undefined): string;
/** Drop denied provider keys (and providers pointing at denied hosts). */
export declare function omitDeniedProviders<T extends {
    baseUrl?: string | null;
}>(providers: Record<string, T>): Record<string, T>;
/**
 * Wraps a pi `ModelRegistry` (any version) in place so providers denied by
 * policy are invisible: list methods drop them, lookups return nothing, and
 * registering one throws. Methods the registry lacks are left alone, so the
 * wrapper keeps working across pi API changes.
 */
export declare function restrictDeniedModelProviders<T extends object>(registry: T): T;
