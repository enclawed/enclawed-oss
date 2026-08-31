export declare const PROXY_ENV_KEYS: readonly ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"];
export declare function hasProxyEnvConfigured(env?: NodeJS.ProcessEnv): boolean;
/**
 * Match undici EnvHttpProxyAgent semantics for env-based HTTP/S proxy selection:
 * - lower-case vars take precedence over upper-case
 * - HTTPS requests prefer https_proxy/HTTPS_PROXY, then fall back to http_proxy/HTTP_PROXY
 * - ALL_PROXY is ignored by EnvHttpProxyAgent
 */
export declare function resolveEnvHttpProxyUrl(protocol: "http" | "https", env?: NodeJS.ProcessEnv): string | undefined;
export declare function hasEnvHttpProxyConfigured(protocol?: "http" | "https", env?: NodeJS.ProcessEnv): boolean;
/**
 * Returns true if either HTTP_PROXY or HTTPS_PROXY (or lower-case variants) is
 * configured in the environment. Use this when constructing an undici
 * EnvHttpProxyAgent — the agent reads both protocols itself, so the relevant
 * question is whether any proxy var is set, not which protocol.
 */
export declare function hasEnvHttpProxyAgentConfigured(env?: NodeJS.ProcessEnv): boolean;
/**
 * Resolve the env-derived overrides to pass into the undici EnvHttpProxyAgent
 * constructor. Reflects the current process env (lower-case takes precedence
 * over upper-case, matching undici's own semantics).
 */
export declare function resolveEnvHttpProxyAgentOptions(env?: NodeJS.ProcessEnv): {
    httpProxy?: string;
    httpsProxy?: string;
    noProxy?: string;
};
/**
 * Returns true when the env proxy should be used for the given target URL.
 * False when no proxy is configured OR the target matches NO_PROXY.
 */
export declare function shouldUseEnvHttpProxyForUrl(url: string, env?: NodeJS.ProcessEnv): boolean;
/**
 * Check whether a target URL should bypass the HTTP proxy per NO_PROXY env var.
 *
 * Mirrors undici EnvHttpProxyAgent semantics
 * (`undici/lib/dispatcher/env-http-proxy-agent.js`):
 * - Entries separated by commas OR whitespace (undici splits on `/[,\s]/`)
 * - Case-insensitive
 * - Empty or missing → no bypass
 * - `*` → bypass everything
 * - Exact hostname match
 * - Leading-dot match (`.example.com` matches `foo.example.com`)
 * - Leading `*.` wildcard match (`*.example.com` matches `foo.example.com`);
 *   undici normalizes via `.replace(/^\*?\./, '')`, so the bare domain also
 *   matches (kept in sync with that behavior)
 * - Subdomain suffix match (`openai.com` matches `api.openai.com`)
 * - Optional `:port` suffix; when present, must match target port
 * - IPv6 literals in bracketed form (`[::1]`)
 *
 * Undici does not export its matcher, so this is a targeted reimplementation
 * kept in sync with the upstream file above. Paired with
 * `hasEnvHttpProxyConfigured` this gates the trusted-env-proxy auto-upgrade
 * in provider HTTP helpers; see enclawed#64974 review thread on NO_PROXY
 * SSRF bypass.
 */
export declare function matchesNoProxy(targetUrl: string, env?: NodeJS.ProcessEnv): boolean;
