import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { AuthProfileStore, OAuthCredential } from "./types.js";
export declare function isRefreshTokenReusedError(error: unknown): boolean;
type ResolveApiKeyForProfileParams = {
    cfg?: EnclawedConfig;
    store: AuthProfileStore;
    profileId: string;
    agentDir?: string;
};
/**
 * Drop any in-flight entries in the module-level refresh queue. Intended
 * exclusively for tests that exercise the concurrent-refresh surface; a
 * timed-out test can leave pending gates in the map and confuse subsequent
 * tests that share the same Vitest worker.
 */
export declare function resetOAuthRefreshQueuesForTest(): void;
/**
 * Mirror a refreshed OAuth credential back into the main-agent store so peer
 * agents adopt it on their next `adoptNewerMainOAuthCredential` pass instead
 * of racing to refresh the (now-single-used) refresh token.
 *
 * Identity binding (CWE-284): we require positive evidence the existing main
 * credential and the refreshed credential belong to the same account before
 * overwriting. If both sides expose `accountId` (strongest signal, Codex CLI)
 * they must match; otherwise if both expose `email` they must match (case-
 * insensitive, trimmed). Provider-only matches are not sufficient because
 * nothing guarantees two agents with the same profileId are authenticated as
 * the same user. This prevents a compromised sub-agent from poisoning the
 * main store's credentials.
 *
 * Serialization: uses `updateAuthProfileStoreWithLock` so the read-modify-
 * write takes the main-store lock and cannot race with other main-store
 * writers (e.g. `updateAuthProfileStoreWithLock` in other flows, CLI-sync).
 *
 * Intentionally best-effort: a failure here must not fail the caller's
 * refresh, since the credential has already been persisted to the agent's
 * own store and returned to the requester.
 */
export declare function normalizeAuthIdentityToken(value: string | undefined): string | undefined;
export declare function normalizeAuthEmailToken(value: string | undefined): string | undefined;
/**
 * Returns true if `existing` and `incoming` provably belong to the same
 * account. Used to gate cross-agent credential mirroring.
 *
 * The rule is intentionally strict to satisfy the CWE-284 model:
 *   1. If one side carries identity metadata (accountId or email) and the
 *      other does not, refuse — we have no evidence they match.
 *   2. If both sides carry identity, a shared field must match (accountId
 *      wins over email when both present). If the two sides carry identity
 *      in non-overlapping fields (one has only accountId, the other only
 *      email), refuse.
 *   3. If neither side carries identity, return true: no evidence of
 *      mismatch and provider equality is checked separately by the caller.
 *
 * The previous permissive behaviour (fall back to `true` whenever a strict
 * comparison could not be made) was unsafe: a sub-agent whose refreshed
 * credential lacked identity metadata could overwrite a known-account main
 * credential that had it, allowing cross-account poisoning through the
 * mirror path.
 */
export declare function isSameOAuthIdentity(existing: Pick<OAuthCredential, "accountId" | "email">, incoming: Pick<OAuthCredential, "accountId" | "email">): boolean;
/**
 * Identity gate used for both directions of credential copy:
 *   - mirror (sub-agent refresh -> main agent store)
 *   - adopt (main agent store -> sub-agent store)
 *
 * Rule: allow the copy iff
 *   1. no positive identity mismatch — if both sides expose the same
 *      identity field (accountId or email), the values must match, AND
 *   2. the incoming credential carries at least as much identity
 *      evidence as the existing one — if existing has accountId/email,
 *      incoming must carry the same field, AND
 *   3. when both sides carry identity but in non-overlapping fields
 *      (existing has only accountId, incoming has only email, or vice
 *      versa) we cannot positively prove the same account and the copy
 *      is refused.
 *
 * Accepts:
 *   - matching accountId (positive match on strongest field)
 *   - matching email when accountId is absent on both sides
 *   - neither side carries identity (no evidence of mismatch)
 *   - existing has no identity, incoming has identity (UPGRADE: adds
 *     the marker without dropping anything)
 *
 * Refuses:
 *   - mismatching accountId or email on a shared field (CWE-284 core)
 *   - incoming drops an identity field present on existing (regression
 *     that would later let a wrong-account peer pass this gate)
 *   - non-overlapping fields (no comparable positive match)
 *
 * Design note: this is a single unified rule for both copy directions.
 * The rule is deliberately one-sided because "existing" is whatever is
 * about to be overwritten and "incoming" is the new data — the
 * constraint is the same regardless of whether existing is main or sub.
 */
export declare function isSafeToCopyOAuthIdentity(existing: Pick<OAuthCredential, "accountId" | "email">, incoming: Pick<OAuthCredential, "accountId" | "email">): boolean;
export declare function resolveApiKeyForProfile(params: ResolveApiKeyForProfileParams): Promise<{
    apiKey: string;
    provider: string;
    email?: string;
} | null>;
export {};
