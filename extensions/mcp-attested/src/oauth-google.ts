// OAuth 2.0 bearer-token provider for the Google Workspace MCP servers.
//
// enclawed deliberately does NOT do the interactive OAuth dance itself. The
// operator picks one of two paths:
//
//   1) Pre-acquired access token: set
//        ENCLAWED_GOOGLE_OAUTH_TOKEN = ya29.<...>
//      and we use it verbatim. The operator is responsible for refresh.
//
//   2) Refresh-token: set
//        ENCLAWED_GOOGLE_OAUTH_CLIENT_ID
//        ENCLAWED_GOOGLE_OAUTH_CLIENT_SECRET
//        ENCLAWED_GOOGLE_OAUTH_REFRESH_TOKEN
//      and we exchange those for a fresh access token on demand against
//      https://oauth2.googleapis.com/token. The token is cached in-process
//      until ~60s before its declared expiry.
//
// In both paths, the legacy ENCLAWED_* aliases are honored — src/infra/
// brand-env.ts mirrors prefixes so reading either prefix here works.
//
// What this file does NOT do:
//   - It does not persist tokens to disk. A refresh token lives in env;
//     access tokens live only in process memory.
//   - It does not pop a browser. Use `gcloud auth application-default
//     login` once on the operator's workstation to obtain the refresh
//     token, then place it in the env var.

const GOOGLE_OAUTH_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export type GoogleOAuthEnv = Readonly<{
  ENCLAWED_GOOGLE_OAUTH_TOKEN?: string;
  ENCLAWED_GOOGLE_OAUTH_CLIENT_ID?: string;
  ENCLAWED_GOOGLE_OAUTH_CLIENT_SECRET?: string;
  ENCLAWED_GOOGLE_OAUTH_REFRESH_TOKEN?: string;
  ENCLAWED_GOOGLE_OAUTH_TOKEN_ENDPOINT?: string;
  OPENCLAW_GOOGLE_OAUTH_TOKEN?: string;
  OPENCLAW_GOOGLE_OAUTH_CLIENT_ID?: string;
  OPENCLAW_GOOGLE_OAUTH_CLIENT_SECRET?: string;
  OPENCLAW_GOOGLE_OAUTH_REFRESH_TOKEN?: string;
  OPENCLAW_GOOGLE_OAUTH_TOKEN_ENDPOINT?: string;
}>;

export type GoogleOAuthProviderOptions = Readonly<{
  env?: GoogleOAuthEnv;
  fetchImpl?: typeof fetch;
  // Test seam: clock for cache expiry.
  now?: () => number;
}>;

function read(env: GoogleOAuthEnv, key: string): string | undefined {
  const enclawed = (env as Record<string, string | undefined>)[`ENCLAWED_${key}`];
  if (enclawed && enclawed.length > 0) return enclawed;
  const legacy = (env as Record<string, string | undefined>)[`OPENCLAW_${key}`];
  if (legacy && legacy.length > 0) return legacy;
  return undefined;
}

type CachedToken = { token: string; expiresAt: number };

export class GoogleOAuthProvider {
  private readonly env: GoogleOAuthEnv;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private cached: CachedToken | undefined;

  constructor(opts: GoogleOAuthProviderOptions = {}) {
    this.env = opts.env ?? (process.env as unknown as GoogleOAuthEnv);
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as typeof fetch);
    this.now = opts.now ?? Date.now;
  }

  /**
   * Resolve a fresh access token. Throws if no auth material is configured.
   * Cache window: 60s before declared expiry, to absorb clock skew.
   */
  async getToken(): Promise<string> {
    const direct = read(this.env, "GOOGLE_OAUTH_TOKEN");
    if (direct) return direct;

    const clientId = read(this.env, "GOOGLE_OAUTH_CLIENT_ID");
    const clientSecret = read(this.env, "GOOGLE_OAUTH_CLIENT_SECRET");
    const refresh = read(this.env, "GOOGLE_OAUTH_REFRESH_TOKEN");
    if (!clientId || !clientSecret || !refresh) {
      throw new Error(
        "Google OAuth not configured: set ENCLAWED_GOOGLE_OAUTH_TOKEN, OR " +
          "set ENCLAWED_GOOGLE_OAUTH_CLIENT_ID + " +
          "ENCLAWED_GOOGLE_OAUTH_CLIENT_SECRET + " +
          "ENCLAWED_GOOGLE_OAUTH_REFRESH_TOKEN.",
      );
    }

    const now = this.now();
    if (this.cached && this.cached.expiresAt - 60_000 > now) {
      return this.cached.token;
    }

    const endpoint =
      read(this.env, "GOOGLE_OAUTH_TOKEN_ENDPOINT") ?? GOOGLE_OAUTH_TOKEN_ENDPOINT;

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh,
    });

    const res = await this.fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      let snippet = "";
      try {
        snippet = (await res.text()).slice(0, 256);
      } catch { /* ignore */ }
      throw new Error(`Google OAuth refresh failed: HTTP ${res.status}${snippet ? `: ${snippet}` : ""}`);
    }
    const payload = (await res.json()) as Record<string, unknown>;
    const token = typeof payload.access_token === "string" ? payload.access_token : "";
    if (!token) throw new Error("Google OAuth refresh: response missing access_token");
    const expiresIn =
      typeof payload.expires_in === "number" && payload.expires_in > 0
        ? payload.expires_in
        : 3300; // safe default ~55min
    this.cached = { token, expiresAt: now + expiresIn * 1000 };
    return token;
  }

  /** Clear the in-memory access-token cache (test helper / token rotation). */
  invalidate(): void {
    this.cached = undefined;
  }

  /**
   * Returns true iff the env contains enough material to acquire a token.
   * Useful for bridge load paths that want to fail fast with a clear message.
   */
  isConfigured(): boolean {
    if (read(this.env, "GOOGLE_OAUTH_TOKEN")) return true;
    return Boolean(
      read(this.env, "GOOGLE_OAUTH_CLIENT_ID") &&
        read(this.env, "GOOGLE_OAUTH_CLIENT_SECRET") &&
        read(this.env, "GOOGLE_OAUTH_REFRESH_TOKEN"),
    );
  }
}
