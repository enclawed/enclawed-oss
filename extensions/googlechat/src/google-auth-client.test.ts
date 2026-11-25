import crypto from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type GuardParams = {
  url: string;
  init?: RequestInit;
  dispatcherPolicy?: unknown;
  policy?: unknown;
  auditContext?: string;
};

const mocks = vi.hoisted(() => ({
  buildHostnameAllowlistPolicyFromSuffixAllowlist: vi.fn((hosts: string[]) => ({
    hostnameAllowlist: hosts,
  })),
  fetchWithSsrFGuard: vi.fn(),
}));

vi.mock("@enclawed/plugin-sdk/ssrf-runtime", () => ({
  buildHostnameAllowlistPolicyFromSuffixAllowlist:
    mocks.buildHostnameAllowlistPolicyFromSuffixAllowlist,
  fetchWithSsrFGuard: mocks.fetchWithSsrFGuard,
}));

let clientModule: typeof import("./google-auth-client.js");

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const PRIVATE_KEY_PEM = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
const CREDENTIALS = {
  client_email: "bot@example.iam.gserviceaccount.com",
  private_key: PRIVATE_KEY_PEM,
  token_uri: "https://oauth2.googleapis.com/token",
  type: "service_account",
};
const CHAT_SCOPE = "https://www.googleapis.com/auth/chat.bot";

function respondWith(handler: (params: GuardParams) => Response | Promise<Response>) {
  mocks.fetchWithSsrFGuard.mockImplementation(async (params: GuardParams) => ({
    response: await handler(params),
    release: vi.fn(async () => {}),
  }));
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { status: 200, ...init, headers });
}

beforeAll(async () => {
  clientModule = await import("./google-auth-client.js");
});

beforeEach(() => {
  clientModule.__testing.resetGoogleAuthClientForTests();
  clientModule.__testing.setSleepForTests(async () => {});
  mocks.fetchWithSsrFGuard.mockReset();
  for (const name of ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"]) {
    vi.stubEnv(name, "");
  }
  vi.stubEnv("NO_PROXY", "");
  vi.stubEnv("no_proxy", "");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("GoogleServiceAccountTokenClient", () => {
  it("posts an RFC 7523 JWT-bearer grant signed with the service account key", async () => {
    const requests: GuardParams[] = [];
    respondWith((params) => {
      requests.push(params);
      return jsonResponse({ access_token: "ya29.token", expires_in: 3599, token_type: "Bearer" });
    });

    const client = new clientModule.GoogleServiceAccountTokenClient(CREDENTIALS, [CHAT_SCOPE]);
    await expect(client.getAccessToken()).resolves.toBe("ya29.token");

    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.url).toBe("https://oauth2.googleapis.com/token");
    expect(request.auditContext).toBe("googlechat.auth.google-auth");
    expect(request.policy).toEqual({
      hostnameAllowlist: ["accounts.google.com", "googleapis.com"],
    });
    expect(request.dispatcherPolicy).toBeUndefined();
    expect(request.init?.method).toBe("POST");
    expect(request.init?.headers).toMatchObject({
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    });
    const body = request.init?.body;
    expect(typeof body).toBe("string");
    const form = new URLSearchParams(typeof body === "string" ? body : "");
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    const assertion = form.get("assertion") ?? "";
    const [header, payload, signature] = assertion.split(".") as [string, string, string];
    expect(
      crypto.verify(
        "sha256",
        Buffer.from(`${header}.${payload}`),
        publicKey,
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    expect(claims).toMatchObject({
      iss: CREDENTIALS.client_email,
      scope: CHAT_SCOPE,
      aud: "https://oauth2.googleapis.com/token",
    });
    expect(claims.exp - claims.iat).toBe(3600);
    expect(claims).not.toHaveProperty("sub");
  });

  it("caches the token until five minutes before expiry, then refreshes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    let issued = 0;
    respondWith(() => jsonResponse({ access_token: `token-${++issued}`, expires_in: 3600 }));
    const client = new clientModule.GoogleServiceAccountTokenClient(CREDENTIALS, [CHAT_SCOPE]);

    await expect(client.getAccessToken()).resolves.toBe("token-1");
    vi.setSystemTime(new Date("2026-01-01T00:54:00Z"));
    await expect(client.getAccessToken()).resolves.toBe("token-1");
    expect(mocks.fetchWithSsrFGuard).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-01-01T00:55:00Z"));
    await expect(client.getAccessToken()).resolves.toBe("token-2");
    expect(mocks.fetchWithSsrFGuard).toHaveBeenCalledTimes(2);
  });

  it("does not cache tokens that carry no lifetime", async () => {
    let issued = 0;
    respondWith(() => jsonResponse({ access_token: `token-${++issued}` }));
    const client = new clientModule.GoogleServiceAccountTokenClient(CREDENTIALS, [CHAT_SCOPE]);
    await expect(client.getAccessToken()).resolves.toBe("token-1");
    await expect(client.getAccessToken()).resolves.toBe("token-2");
  });

  it("shares one in-flight grant across concurrent callers", async () => {
    respondWith(() => jsonResponse({ access_token: "shared", expires_in: 3600 }));
    const client = new clientModule.GoogleServiceAccountTokenClient(CREDENTIALS, [CHAT_SCOPE]);
    const tokens = await Promise.all([client.getAccessToken(), client.getAccessToken()]);
    expect(tokens).toEqual(["shared", "shared"]);
    expect(mocks.fetchWithSsrFGuard).toHaveBeenCalledTimes(1);
  });

  it("surfaces the OAuth error without retrying client errors", async () => {
    respondWith(() =>
      jsonResponse(
        { error: "invalid_grant", error_description: "Invalid JWT Signature." },
        { status: 400 },
      ),
    );
    const client = new clientModule.GoogleServiceAccountTokenClient(CREDENTIALS, [CHAT_SCOPE]);
    await expect(client.getAccessToken()).rejects.toThrow("invalid_grant: Invalid JWT Signature.");
    expect(mocks.fetchWithSsrFGuard).toHaveBeenCalledTimes(1);
  });

  it("retries transient server errors like gaxios did", async () => {
    const sleeps: number[] = [];
    clientModule.__testing.setSleepForTests(async (ms) => {
      sleeps.push(ms);
    });
    let calls = 0;
    respondWith(() =>
      ++calls < 3
        ? new Response("unavailable", { status: 503 })
        : jsonResponse({ access_token: "after-retry", expires_in: 3600 }),
    );
    const client = new clientModule.GoogleServiceAccountTokenClient(CREDENTIALS, [CHAT_SCOPE]);
    await expect(client.getAccessToken()).resolves.toBe("after-retry");
    expect(sleeps).toEqual([100, 500]);
  });

  it("rejects responses without an access token", async () => {
    respondWith(() => jsonResponse({ token_type: "Bearer" }));
    const client = new clientModule.GoogleServiceAccountTokenClient(CREDENTIALS, [CHAT_SCOPE]);
    await expect(client.getAccessToken()).rejects.toThrow("Could not refresh access token.");
  });

  it("routes through the env proxy with gaxios precedence and honors NO_PROXY", async () => {
    vi.stubEnv("HTTPS_PROXY", "http://upper-https-proxy.example:8080");
    vi.stubEnv("http_proxy", "http://lower-http-proxy.example:8080");
    respondWith(() => jsonResponse({ access_token: "proxied", expires_in: 3600 }));
    const client = new clientModule.GoogleServiceAccountTokenClient(CREDENTIALS, [CHAT_SCOPE]);
    await client.getAccessToken();
    expect(mocks.fetchWithSsrFGuard.mock.calls[0]?.[0]).toMatchObject({
      dispatcherPolicy: {
        allowPrivateProxy: true,
        mode: "explicit-proxy",
        proxyUrl: "http://upper-https-proxy.example:8080",
      },
    });
    expect(mocks.fetchWithSsrFGuard.mock.calls[0]?.[0].init).not.toHaveProperty("proxy");

    vi.stubEnv("NO_PROXY", "oauth2.googleapis.com");
    const bypassed = new clientModule.GoogleServiceAccountTokenClient(CREDENTIALS, [CHAT_SCOPE]);
    await bypassed.getAccessToken();
    expect(mocks.fetchWithSsrFGuard.mock.calls[1]?.[0].dispatcherPolicy).toBeUndefined();
  });
});

describe("fetchGoogleFederatedSignonCerts", () => {
  it("fetches the v1 PEM certs through the guard and caches them for max-age", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    respondWith(() =>
      jsonResponse(
        { "kid-1": "PEM-1" },
        { headers: { "cache-control": "public, max-age=600, must-revalidate" } },
      ),
    );

    await expect(clientModule.fetchGoogleFederatedSignonCerts()).resolves.toEqual({
      "kid-1": "PEM-1",
    });
    expect(mocks.fetchWithSsrFGuard.mock.calls[0]?.[0]).toMatchObject({
      url: "https://www.googleapis.com/oauth2/v1/certs",
      auditContext: "googlechat.auth.google-auth",
      init: { method: "GET" },
    });
    vi.setSystemTime(new Date("2026-01-01T00:09:59Z"));
    await clientModule.fetchGoogleFederatedSignonCerts();
    expect(mocks.fetchWithSsrFGuard).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-01-01T00:10:00Z"));
    await clientModule.fetchGoogleFederatedSignonCerts();
    expect(mocks.fetchWithSsrFGuard).toHaveBeenCalledTimes(2);
  });

  it("does not cache certs served without max-age", async () => {
    respondWith(() => jsonResponse({ "kid-1": "PEM-1" }));
    await clientModule.fetchGoogleFederatedSignonCerts();
    await clientModule.fetchGoogleFederatedSignonCerts();
    expect(mocks.fetchWithSsrFGuard).toHaveBeenCalledTimes(2);
  });

  it("fails closed on malformed cert maps and fetch failures", async () => {
    respondWith(() =>
      jsonResponse({ "kid-1": 42 }, { headers: { "cache-control": "max-age=60" } }),
    );
    await expect(clientModule.fetchGoogleFederatedSignonCerts()).rejects.toThrow("non-string");

    respondWith(() => jsonResponse(["PEM"]));
    await expect(clientModule.fetchGoogleFederatedSignonCerts()).rejects.toThrow("not an object");

    respondWith(() => jsonResponse({}));
    await expect(clientModule.fetchGoogleFederatedSignonCerts()).rejects.toThrow("empty");

    respondWith(() => new Response("nope", { status: 404 }));
    await expect(clientModule.fetchGoogleFederatedSignonCerts()).rejects.toThrow(
      "Failed to retrieve verification certificates",
    );

    respondWith(() => new Response("<html>", { status: 200 }));
    await expect(clientModule.fetchGoogleFederatedSignonCerts()).rejects.toThrow("not valid JSON");
  });
});
