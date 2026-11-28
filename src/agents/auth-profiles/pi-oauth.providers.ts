/**
 * Providers whose OAuth token refresh Enclawed delegates to pi-ai when no
 * provider plugin refreshed the credential first. This is exactly the
 * built-in OAuth registry pi-ai 0.80.2 shipped (`getOAuthProviders()`); pi-ai
 * 1.x attaches OAuth to more providers, but widening the delegation set would
 * silently change which stored credentials Enclawed hands to pi, so it stays
 * pinned here and only grows by an explicit edit.
 *
 * A leaf module: both pi-oauth.ts and its lazily loaded runtime import it, so
 * neither imports the other.
 */
export const PI_OAUTH_PROVIDER_IDS = ["anthropic", "github-copilot", "openai-codex"] as const;

export type PiOAuthProviderId = (typeof PI_OAUTH_PROVIDER_IDS)[number];

const PI_OAUTH_PROVIDER_ID_SET: ReadonlySet<string> = new Set(PI_OAUTH_PROVIDER_IDS);

export function isPiOAuthProviderId(provider: string): provider is PiOAuthProviderId {
  return PI_OAUTH_PROVIDER_ID_SET.has(provider);
}
