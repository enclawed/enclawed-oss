import type { OAuthCredentials } from "@mariozechner/pi-ai/oauth";
import { isPiOAuthProviderId } from "./pi-oauth.providers.js";
import type { OAuthCredential } from "./types.js";

export { isPiOAuthProviderId, type PiOAuthProviderId } from "./pi-oauth.providers.js";

/**
 * Refresh-if-expired plus API-key derivation through pi-ai's OAuth flows, with
 * the semantics of pi-ai 0.80.2 `getOAuthApiKey()`: the token is refreshed only
 * when `Date.now() >= expires`, the API key is derived from the resulting
 * credential, and refresh failures surface as
 * `Failed to refresh OAuth token for <provider>` (the provider error is kept as
 * `cause`, so callers that classify errors such as `refresh_token_reused` see
 * it through the cause chain).
 *
 * Enclawed stays the credential authority: the credential comes from
 * Enclawed's auth-profile store and the refreshed credential is returned to the
 * caller for persistence there. pi-ai's `OAuthAuth.refresh`/`toAuth` are pure
 * network/derivation calls; no pi credential store, auth.json, or ~/.pi path is
 * involved.
 *
 * Returns null for providers outside the pinned set in pi-oauth.providers.ts.
 */
export async function getPiOAuthApiKey(params: {
  provider: string;
  credential: OAuthCredential;
  signal: AbortSignal;
}): Promise<{ apiKey: string; newCredentials: OAuthCredentials } | null> {
  if (!isPiOAuthProviderId(params.provider)) {
    return null;
  }
  const { resolvePiOAuthAuth } = await import("./pi-oauth.runtime.js");
  const oauth = resolvePiOAuthAuth(params.provider);
  let credential: OAuthCredential = params.credential;
  if (Date.now() >= credential.expires) {
    try {
      const refreshed = await oauth.refresh(credential, params.signal);
      credential = { ...credential, ...refreshed, type: "oauth" };
    } catch (error) {
      throw new Error(`Failed to refresh OAuth token for ${params.provider}`, { cause: error });
    }
  }
  const auth = await oauth.toAuth(credential);
  if (typeof auth.apiKey !== "string" || auth.apiKey.length === 0) {
    throw new Error(`pi-ai OAuth for ${params.provider} did not derive an API key`);
  }
  return { apiKey: auth.apiKey, newCredentials: credential };
}
