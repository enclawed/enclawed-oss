import { describe, expect, it } from "vitest";
import { GoogleOAuthProvider } from "./oauth-google.js";

describe("GoogleOAuthProvider", () => {
  it("returns the direct token verbatim when ENCLAWED_GOOGLE_OAUTH_TOKEN is set", async () => {
    const provider = new GoogleOAuthProvider({
      env: { ENCLAWED_GOOGLE_OAUTH_TOKEN: "ya29.direct" },
    });
    expect(provider.isConfigured()).toBe(true);
    expect(await provider.getToken()).toBe("ya29.direct");
  });

  it("falls back to ENCLAWED_GOOGLE_OAUTH_TOKEN if the ENCLAWED_ name is unset", async () => {
    const provider = new GoogleOAuthProvider({
      env: { ENCLAWED_GOOGLE_OAUTH_TOKEN: "ya29.legacy" },
    });
    expect(provider.isConfigured()).toBe(true);
    expect(await provider.getToken()).toBe("ya29.legacy");
  });

  it("exchanges refresh-token + client-id + client-secret for a fresh access token", async () => {
    let lastBody = "";
    const fetchImpl = (async (
      _url: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      lastBody = init?.body as string;
      return new Response(
        JSON.stringify({ access_token: "ya29.fresh", expires_in: 3600 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;
    const provider = new GoogleOAuthProvider({
      env: {
        ENCLAWED_GOOGLE_OAUTH_CLIENT_ID: "client-id-x",
        ENCLAWED_GOOGLE_OAUTH_CLIENT_SECRET: "client-secret-x",
        ENCLAWED_GOOGLE_OAUTH_REFRESH_TOKEN: "1//refresh-x",
      },
      fetchImpl,
    });
    expect(provider.isConfigured()).toBe(true);
    const token = await provider.getToken();
    expect(token).toBe("ya29.fresh");
    const params = new URLSearchParams(lastBody);
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("client_id")).toBe("client-id-x");
    expect(params.get("client_secret")).toBe("client-secret-x");
    expect(params.get("refresh_token")).toBe("1//refresh-x");
  });

  it("caches the exchanged token until ~60s before expiry", async () => {
    let exchanges = 0;
    const fetchImpl = (async () => {
      exchanges++;
      return new Response(
        JSON.stringify({ access_token: `ya29.${exchanges}`, expires_in: 120 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;
    let now = 1_000_000;
    const provider = new GoogleOAuthProvider({
      env: {
        ENCLAWED_GOOGLE_OAUTH_CLIENT_ID: "c",
        ENCLAWED_GOOGLE_OAUTH_CLIENT_SECRET: "s",
        ENCLAWED_GOOGLE_OAUTH_REFRESH_TOKEN: "r",
      },
      fetchImpl,
      now: () => now,
    });
    expect(await provider.getToken()).toBe("ya29.1");
    expect(exchanges).toBe(1);
    // 30 seconds later: still cached.
    now += 30_000;
    expect(await provider.getToken()).toBe("ya29.1");
    expect(exchanges).toBe(1);
    // 70 seconds later (> 60s skew window inside the 120s lifetime): re-exchange.
    now += 70_000;
    expect(await provider.getToken()).toBe("ya29.2");
    expect(exchanges).toBe(2);
  });

  it("throws an actionable error when no OAuth env is present", async () => {
    const provider = new GoogleOAuthProvider({ env: {} });
    expect(provider.isConfigured()).toBe(false);
    await expect(provider.getToken()).rejects.toThrow(/ENCLAWED_GOOGLE_OAUTH_/);
  });

  it("surfaces an HTTP error from the token endpoint with a bounded snippet", async () => {
    const fetchImpl = (async () =>
      new Response("invalid_grant: refresh token revoked", { status: 400 })) as unknown as typeof fetch;
    const provider = new GoogleOAuthProvider({
      env: {
        ENCLAWED_GOOGLE_OAUTH_CLIENT_ID: "c",
        ENCLAWED_GOOGLE_OAUTH_CLIENT_SECRET: "s",
        ENCLAWED_GOOGLE_OAUTH_REFRESH_TOKEN: "r",
      },
      fetchImpl,
    });
    await expect(provider.getToken()).rejects.toThrow(/HTTP 400.*invalid_grant/);
  });
});
