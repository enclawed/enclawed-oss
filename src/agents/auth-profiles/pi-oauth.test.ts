import type { ModelAuth, OAuthCredential as PiOAuthCredential } from "@mariozechner/pi-ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OAuthCredential } from "./types.js";

type PiRefresh = (credential: PiOAuthCredential, signal: AbortSignal) => Promise<PiOAuthCredential>;
type PiToAuth = (credential: PiOAuthCredential) => Promise<ModelAuth>;

const mocks = vi.hoisted(() => ({
  refresh: vi.fn<PiRefresh>(),
  toAuth: vi.fn<PiToAuth>(async (credential) => ({ apiKey: credential.access })),
  resolvePiOAuthAuth: vi.fn(),
}));

vi.mock("./pi-oauth.runtime.js", () => ({
  resolvePiOAuthAuth: mocks.resolvePiOAuthAuth,
}));

// The shared test setup replaces this seam with a null stub; exercise the real one.
const { getPiOAuthApiKey, isPiOAuthProviderId } =
  await vi.importActual<typeof import("./pi-oauth.js")>("./pi-oauth.js");
const { isRefreshTokenReusedError } = await import("./oauth.js");

function storedCredential(overrides: Partial<OAuthCredential> = {}): OAuthCredential {
  return {
    type: "oauth",
    provider: "openai-codex",
    access: "stored-access",
    refresh: "stored-refresh",
    expires: Date.now() + 60_000,
    email: "user@example.test",
    ...overrides,
  };
}

describe("getPiOAuthApiKey", () => {
  beforeEach(() => {
    mocks.refresh.mockReset();
    mocks.toAuth.mockClear();
    mocks.resolvePiOAuthAuth.mockReset();
    mocks.resolvePiOAuthAuth.mockReturnValue({
      name: "test oauth",
      login: vi.fn(),
      refresh: mocks.refresh,
      toAuth: mocks.toAuth,
    });
  });

  it("delegates only the providers pi-ai 0.80.2 refreshed", () => {
    expect(isPiOAuthProviderId("anthropic")).toBe(true);
    expect(isPiOAuthProviderId("github-copilot")).toBe(true);
    expect(isPiOAuthProviderId("openai-codex")).toBe(true);
    expect(isPiOAuthProviderId("xai")).toBe(false);
    expect(isPiOAuthProviderId("openrouter")).toBe(false);
  });

  it("returns null without loading pi flows for other providers", async () => {
    await expect(
      getPiOAuthApiKey({
        provider: "xai",
        credential: storedCredential({ provider: "xai" }),
        signal: new AbortController().signal,
      }),
    ).resolves.toBeNull();
    expect(mocks.resolvePiOAuthAuth).not.toHaveBeenCalled();
  });

  it("derives the API key without refreshing an unexpired credential", async () => {
    const credential = storedCredential();
    await expect(
      getPiOAuthApiKey({
        provider: "openai-codex",
        credential,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ apiKey: "stored-access", newCredentials: credential });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("refreshes an expired credential with the caller's signal and keeps Enclawed fields", async () => {
    const signal = new AbortController().signal;
    const expires = Date.now() + 3_600_000;
    mocks.refresh.mockResolvedValueOnce({
      type: "oauth",
      access: "fresh-access",
      refresh: "fresh-refresh",
      expires,
      accountId: "account-1",
    });

    const result = await getPiOAuthApiKey({
      provider: "openai-codex",
      credential: storedCredential({ expires: Date.now() - 1_000 }),
      signal,
    });

    expect(mocks.refresh).toHaveBeenCalledWith(
      expect.objectContaining({ refresh: "stored-refresh" }),
      signal,
    );
    expect(result).toEqual({
      apiKey: "fresh-access",
      newCredentials: {
        type: "oauth",
        provider: "openai-codex",
        email: "user@example.test",
        access: "fresh-access",
        refresh: "fresh-refresh",
        expires,
        accountId: "account-1",
      },
    });
  });

  it("wraps refresh failures like getOAuthApiKey and keeps the provider error as cause", async () => {
    const providerError = new Error(
      'OpenAI Codex token refresh failed (401): {"error":{"code":"refresh_token_reused"}}',
    );
    mocks.refresh.mockRejectedValueOnce(providerError);

    const failure = await getPiOAuthApiKey({
      provider: "openai-codex",
      credential: storedCredential({ expires: Date.now() - 1_000 }),
      signal: new AbortController().signal,
    }).catch((error: unknown) => error);

    if (!(failure instanceof Error)) {
      throw new Error("expected getPiOAuthApiKey to reject with an Error");
    }
    expect(failure.message).toBe("Failed to refresh OAuth token for openai-codex");
    expect(failure.cause).toBe(providerError);
    expect(isRefreshTokenReusedError(failure)).toBe(true);
  });
});

describe("resolvePiOAuthAuth (pi-ai 1.6.0 wiring)", () => {
  it("resolves pi-ai's OAuth flows for every delegated provider", async () => {
    const { resolvePiOAuthAuth } =
      await vi.importActual<typeof import("./pi-oauth.runtime.js")>("./pi-oauth.runtime.js");
    for (const provider of ["anthropic", "github-copilot", "openai-codex"] as const) {
      const oauth = resolvePiOAuthAuth(provider);
      expect(typeof oauth.refresh).toBe("function");
      expect(typeof oauth.toAuth).toBe("function");
      expect(typeof oauth.login).toBe("function");
    }
  });
});
