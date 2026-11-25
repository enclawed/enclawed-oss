import {
  createGoogleAuthFetch,
  GOOGLE_AUTH_PROVIDER_CERTS_URL,
  GOOGLE_AUTH_TOKEN_URI,
  type GoogleChatServiceAccountCredentials,
} from "./google-auth.runtime.js";
import { createServiceAccountAssertion } from "./google-jwt.js";

// Node-built-in replacement for the parts of google-auth-library / gaxios the
// Google Chat plugin used: the service-account JWT-bearer token grant (with
// OAuth2Client's token cache) and the federated sign-on certificate fetch used
// by verifyIdToken. Every request goes through createGoogleAuthFetch, so the
// SSRF guard, Google-host allowlist, egress audit context and 1 MiB response
// cap are unchanged.

const JWT_BEARER_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:jwt-bearer";
/** google-auth-library DEFAULT_EAGER_REFRESH_THRESHOLD_MILLIS. */
const EAGER_REFRESH_THRESHOLD_MS = 5 * 60 * 1000;
/** gaxios retry defaults: 3 status retries, 2 no-response retries. */
const MAX_STATUS_RETRIES = 3;
const MAX_NO_RESPONSE_RETRIES = 2;
const RETRYABLE_STATUS_RANGES: ReadonlyArray<readonly [number, number]> = [
  [100, 199],
  [408, 408],
  [429, 429],
  [500, 599],
];

type GoogleAuthJsonResponse = {
  data: unknown;
  headers: Headers;
};

type SleepFn = (ms: number) => Promise<void>;

const defaultSleep: SleepFn = async (ms) => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
};

let sleep: SleepFn = defaultSleep;
const googleAuthFetch = createGoogleAuthFetch();
let federatedCertsCache: { certs: Record<string, string>; expiresAtMs: number } | null = null;

/** Non-JSON body on a 2xx response: deterministic, so never retried. */
class GoogleAuthResponseFormatError extends Error {
  constructor() {
    super("Google auth response is not valid JSON");
    this.name = "GoogleAuthResponseFormatError";
  }
}

class GoogleAuthHttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GoogleAuthHttpError";
    this.status = status;
  }
}

/**
 * Proxy precedence gaxios applied before handing the request to our guarded
 * fetch (HTTPS_PROXY, https_proxy, HTTP_PROXY, http_proxy; first non-empty).
 * Passing it as `proxy` keeps the guard's explicit-proxy policy and NO_PROXY
 * bypass identical to the previous gaxios-driven path.
 */
function resolveGaxiosStyleProxyUrl(): string | undefined {
  for (const name of ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"] as const) {
    const value = process.env[name];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS_RANGES.some(([min, max]) => status >= min && status <= max);
}

/** gaxios getNextRetryDelay with retryDelay=100 and multiplier=2. */
function retryDelayMs(attempt: number): number {
  return (attempt === 0 ? 100 : 0) + ((2 ** attempt - 1) / 2) * 1000;
}

function describeGoogleAuthError(data: unknown, status: number): string {
  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    const record = data as Record<string, unknown>;
    if (typeof record.error === "string") {
      const description =
        typeof record.error_description === "string" ? record.error_description : "";
      return `${record.error}: ${description}`;
    }
  }
  return `Google auth request failed with status ${status}`;
}

async function sendOnce(
  url: string,
  init: RequestInit & { proxy?: string },
): Promise<GoogleAuthJsonResponse> {
  const response = await googleAuthFetch(url, init);
  const text = await response.text();
  let data: unknown;
  try {
    data = text.length > 0 ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }
  if (response.status < 200 || response.status >= 300) {
    throw new GoogleAuthHttpError(describeGoogleAuthError(data, response.status), response.status);
  }
  if (data === undefined) {
    throw new GoogleAuthResponseFormatError();
  }
  return { data, headers: response.headers };
}

export async function requestGoogleAuthJson(params: {
  url: string;
  method: "GET" | "POST";
  body?: URLSearchParams;
}): Promise<GoogleAuthJsonResponse> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (params.body) {
    headers["content-type"] = "application/x-www-form-urlencoded;charset=UTF-8";
  }
  const proxy = resolveGaxiosStyleProxyUrl();
  const init: RequestInit & { proxy?: string } = {
    method: params.method,
    headers,
    ...(params.body ? { body: params.body.toString() } : {}),
    ...(proxy ? { proxy } : {}),
  };
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await sendOnce(params.url, init);
    } catch (error) {
      const retryable =
        error instanceof GoogleAuthHttpError
          ? isRetryableStatus(error.status) && attempt < MAX_STATUS_RETRIES
          : !(error instanceof GoogleAuthResponseFormatError) && attempt < MAX_NO_RESPONSE_RETRIES;
      if (!retryable) {
        throw error;
      }
      await sleep(retryDelayMs(attempt));
    }
  }
}

/**
 * Service-account access tokens via the RFC 7523 JWT-bearer grant, cached
 * until five minutes before expiry (OAuth2Client semantics). Concurrent
 * callers share one in-flight grant.
 */
export class GoogleServiceAccountTokenClient {
  readonly #clientEmail: string;
  readonly #privateKey: string;
  readonly #scope: string;
  #cached: { accessToken: string; expiresAtMs: number } | null = null;
  #inFlight: Promise<string> | null = null;

  constructor(credentials: GoogleChatServiceAccountCredentials, scopes: readonly string[]) {
    this.#clientEmail = credentials.client_email.trim();
    this.#privateKey = credentials.private_key;
    this.#scope = scopes.join(" ");
  }

  async getAccessToken(): Promise<string> {
    const cached = this.#cached;
    if (cached && cached.expiresAtMs > Date.now() + EAGER_REFRESH_THRESHOLD_MS) {
      return cached.accessToken;
    }
    if (!this.#inFlight) {
      this.#inFlight = this.#refresh().finally(() => {
        this.#inFlight = null;
      });
    }
    return await this.#inFlight;
  }

  async #refresh(): Promise<string> {
    const assertion = createServiceAccountAssertion({
      clientEmail: this.#clientEmail,
      privateKey: this.#privateKey,
      scope: this.#scope,
      audience: GOOGLE_AUTH_TOKEN_URI,
    });
    const { data } = await requestGoogleAuthJson({
      url: GOOGLE_AUTH_TOKEN_URI,
      method: "POST",
      body: new URLSearchParams({ grant_type: JWT_BEARER_GRANT_TYPE, assertion }),
    });
    const record =
      data !== null && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    const accessToken = record.access_token;
    if (typeof accessToken !== "string" || accessToken.length === 0) {
      throw new Error("Could not refresh access token.");
    }
    const expiresIn =
      typeof record.expires_in === "number" &&
      Number.isFinite(record.expires_in) &&
      record.expires_in > 0
        ? record.expires_in
        : 0;
    this.#cached = { accessToken, expiresAtMs: Date.now() + expiresIn * 1000 };
    return accessToken;
  }
}

function parseCacheControlMaxAgeMs(cacheControl: string | null): number | null {
  if (!cacheControl) {
    return null;
  }
  const match = /max-age=([0-9]+)/.exec(cacheControl);
  return match ? Number(match[1]) * 1000 : null;
}

export function parsePemCertMap(data: unknown): Record<string, string> {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Verification certificates response is not an object");
  }
  const certs: Record<string, string> = {};
  for (const [kid, cert] of Object.entries(data as Record<string, unknown>)) {
    if (typeof cert !== "string" || cert.length === 0) {
      throw new Error("Verification certificates response has a non-string entry");
    }
    certs[kid] = cert;
  }
  if (Object.keys(certs).length === 0) {
    throw new Error("Verification certificates response is empty");
  }
  return certs;
}

/**
 * Google's OAuth2 federated sign-on PEM certificates (the v1 endpoint
 * OAuth2Client.verifyIdToken uses under Node), cached for the response's
 * Cache-Control max-age and not cached when the header carries none.
 */
export async function fetchGoogleFederatedSignonCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (federatedCertsCache && now < federatedCertsCache.expiresAtMs) {
    return federatedCertsCache.certs;
  }
  let response: GoogleAuthJsonResponse;
  try {
    response = await requestGoogleAuthJson({ url: GOOGLE_AUTH_PROVIDER_CERTS_URL, method: "GET" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to retrieve verification certificates: ${message}`, { cause: error });
  }
  const certs = parsePemCertMap(response.data);
  const maxAgeMs = parseCacheControlMaxAgeMs(response.headers.get("cache-control"));
  federatedCertsCache = maxAgeMs === null ? null : { certs, expiresAtMs: now + maxAgeMs };
  return certs;
}

export const __testing = {
  resetGoogleAuthClientForTests(): void {
    federatedCertsCache = null;
    sleep = defaultSleep;
  },
  setSleepForTests(next: SleepFn): void {
    sleep = next;
  },
  resolveGaxiosStyleProxyUrl,
  retryDelayMs,
};
