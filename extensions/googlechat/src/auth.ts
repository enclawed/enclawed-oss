import { normalizeLowercaseStringOrEmpty } from "@enclawed/plugin-sdk/text-runtime";
import { fetchWithSsrFGuard } from "../runtime-api.js";
import type { ResolvedGoogleChatAccount } from "./accounts.js";
import {
  __testing as googleAuthClientTesting,
  fetchGoogleFederatedSignonCerts,
  GoogleServiceAccountTokenClient,
  parsePemCertMap,
} from "./google-auth-client.js";
import { resolveValidatedGoogleChatCredentials } from "./google-auth.runtime.js";
import { verifyGoogleSignedJwt } from "./google-jwt.js";

const CHAT_SCOPE = "https://www.googleapis.com/auth/chat.bot";
const CHAT_ISSUER = "chat@system.gserviceaccount.com";
// Google Workspace Add-ons use a different service account pattern
const ADDON_ISSUER_PATTERN = /^service-\d+@gcp-sa-gsuiteaddons\.iam\.gserviceaccount\.com$/;
const CHAT_CERTS_URL =
  "https://www.googleapis.com/service_accounts/v1/metadata/x509/chat@system.gserviceaccount.com";
// Issuers of Google-signed OpenID Connect ID tokens (app-url audience). The
// library also accepted its universe domain ("googleapis.com"), which Google
// never uses as an ID-token issuer; it is intentionally not accepted here.
const GOOGLE_ID_TOKEN_ISSUERS = ["accounts.google.com", "https://accounts.google.com"] as const;

// Size-capped to prevent unbounded growth in long-running deployments (#4948)
const MAX_AUTH_CACHE_SIZE = 32;

const authCache = new Map<string, { key: string; auth: GoogleServiceAccountTokenClient }>();

let cachedCerts: { fetchedAt: number; certs: Record<string, string> } | null = null;

function buildAuthKey(account: ResolvedGoogleChatAccount): string {
  if (account.credentialsFile) {
    return `file:${account.credentialsFile}`;
  }
  if (account.credentials) {
    return `inline:${JSON.stringify(account.credentials)}`;
  }
  return "none";
}

async function getAuthInstance(
  account: ResolvedGoogleChatAccount,
): Promise<GoogleServiceAccountTokenClient> {
  const key = buildAuthKey(account);
  const cached = authCache.get(account.accountId);
  if (cached && cached.key === key) {
    return cached.auth;
  }
  const credentials = await resolveValidatedGoogleChatCredentials(account);
  // Accounts without a configured service account never reach the token path
  // (isConfigured gates them); refuse instead of falling back to ambient
  // Application Default Credentials or the GCE metadata server.
  if (!credentials) {
    throw new Error("Google Chat credentials are missing.");
  }

  const evictOldest = () => {
    if (authCache.size > MAX_AUTH_CACHE_SIZE) {
      const oldest = authCache.keys().next().value;
      if (oldest !== undefined) {
        authCache.delete(oldest);
      }
    }
  };

  const auth = new GoogleServiceAccountTokenClient(credentials, [CHAT_SCOPE]);
  authCache.set(account.accountId, { key, auth });
  evictOldest();
  return auth;
}

export async function getGoogleChatAccessToken(
  account: ResolvedGoogleChatAccount,
): Promise<string> {
  const auth = await getAuthInstance(account);
  const token = await auth.getAccessToken();
  if (!token) {
    throw new Error("Missing Google Chat access token");
  }
  return token;
}

async function fetchChatCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedCerts && now - cachedCerts.fetchedAt < 10 * 60 * 1000) {
    return cachedCerts.certs;
  }
  const { response, release } = await fetchWithSsrFGuard({
    url: CHAT_CERTS_URL,
    auditContext: "googlechat.auth.certs",
  });
  try {
    if (!response.ok) {
      throw new Error(`Failed to fetch Chat certs (${response.status})`);
    }
    const certs = parsePemCertMap(await response.json());
    cachedCerts = { fetchedAt: now, certs };
    return certs;
  } finally {
    await release();
  }
}

export type GoogleChatAudienceType = "app-url" | "project-number";

export async function verifyGoogleChatRequest(params: {
  bearer?: string | null;
  audienceType?: GoogleChatAudienceType | null;
  audience?: string | null;
  expectedAddOnPrincipal?: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  const bearer = params.bearer?.trim();
  if (!bearer) {
    return { ok: false, reason: "missing token" };
  }
  const audience = params.audience?.trim();
  if (!audience) {
    return { ok: false, reason: "missing audience" };
  }
  const audienceType = params.audienceType ?? null;

  if (audienceType === "app-url") {
    try {
      const certs = await fetchGoogleFederatedSignonCerts();
      const { payload } = verifyGoogleSignedJwt({
        jwt: bearer,
        certs,
        audience,
        issuers: GOOGLE_ID_TOKEN_ISSUERS,
      });
      const email = normalizeLowercaseStringOrEmpty(
        typeof payload.email === "string" ? payload.email : "",
      );
      if (payload.email_verified !== true) {
        return { ok: false, reason: "email not verified" };
      }
      if (email === CHAT_ISSUER) {
        return { ok: true };
      }
      if (!ADDON_ISSUER_PATTERN.test(email)) {
        return { ok: false, reason: `invalid issuer: ${email}` };
      }
      const expectedAddOnPrincipal = normalizeLowercaseStringOrEmpty(
        params.expectedAddOnPrincipal ?? "",
      );
      if (!expectedAddOnPrincipal) {
        return { ok: false, reason: "missing add-on principal binding" };
      }
      const tokenPrincipal = normalizeLowercaseStringOrEmpty(
        typeof payload.sub === "string" ? payload.sub : "",
      );
      if (!tokenPrincipal || tokenPrincipal !== expectedAddOnPrincipal) {
        return {
          ok: false,
          reason: `unexpected add-on principal: ${tokenPrincipal || "<missing>"}`,
        };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : "invalid token" };
    }
  }

  if (audienceType === "project-number") {
    try {
      const certs = await fetchChatCerts();
      verifyGoogleSignedJwt({ jwt: bearer, certs, audience, issuers: [CHAT_ISSUER] });
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : "invalid token" };
    }
  }

  return { ok: false, reason: "unsupported audience type" };
}

export const __testing = {
  resetGoogleChatAuthForTests(): void {
    authCache.clear();
    cachedCerts = null;
    googleAuthClientTesting.resetGoogleAuthClientForTests();
  },
};
