// Mail sign-in: provider recognition, PKCE, the loopback redirect, and token
// exchange. The loopback test drives a real HTTP request against a real
// listener on 127.0.0.1; everything else is deterministic with a stubbed
// fetch. No network, no credentials.

import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildAuthorizeUrl,
  createPkce,
  createState,
  detectProvider,
  detectProviderByDomain,
  domainOf,
  exchangeCode,
  needsRefresh,
  refreshTokens,
  startLoopbackCapture,
  xoauth2Token,
} from "../../enclawed-apps/executive-assistant/src/tools/mail-oauth.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubToken(payload: unknown, status = 200): Array<Record<string, string>> {
  const forms: Array<Record<string, string>> = [];
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? init.body : "";
    forms.push(Object.fromEntries(new URLSearchParams(body)));
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return forms;
}

describe("provider recognition", () => {
  it("reads the domain off the address", () => {
    expect(domainOf("Alfredo.Metere+tag@Gmail.COM")).toBe("gmail.com");
    expect(domainOf("not-an-address")).toBe("");
  });

  it("recognises the consumer domains", () => {
    expect(detectProviderByDomain("a@gmail.com")).toBe("google");
    expect(detectProviderByDomain("a@googlemail.com")).toBe("google");
    expect(detectProviderByDomain("a@outlook.com")).toBe("microsoft");
    expect(detectProviderByDomain("a@hotmail.com")).toBe("microsoft");
    expect(detectProviderByDomain("a@enclawed.com")).toBe("unknown");
  });

  it("recognises a custom domain by its MX records", async () => {
    // This is most business mail: a Workspace or 365 domain is invisible from
    // the address, and without this every such user lands on a manual-setup
    // screen.
    const workspace = async () => [{ exchange: "aspmx.l.google.com." }];
    const m365 = async () => [{ exchange: "enclawed-com.mail.protection.outlook.com" }];
    expect(await detectProvider("a@enclawed.com", workspace)).toBe("google");
    expect(await detectProvider("a@enclawed.com", m365)).toBe("microsoft");
  });

  it("says unknown for a domain that runs its own mail", async () => {
    const own = async () => [{ exchange: "mx1.enclawed.com" }];
    expect(await detectProvider("a@enclawed.com", own)).toBe("unknown");
  });

  it("treats a failed lookup as unknown rather than an error", async () => {
    const offline = async () => {
      throw new Error("ENOTFOUND");
    };
    await expect(detectProvider("a@enclawed.com", offline)).resolves.toBe("unknown");
  });

  it("does not look up MX when the domain already answers", async () => {
    let called = false;
    const resolver = async () => {
      called = true;
      return [];
    };
    expect(await detectProvider("a@gmail.com", resolver)).toBe("google");
    expect(called).toBe(false);
  });
});

describe("PKCE", () => {
  it("derives the challenge as base64url(sha256(verifier))", () => {
    const pkce = createPkce();
    const expected = createHash("sha256")
      .update(pkce.verifier)
      .digest("base64")
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    expect(pkce.challenge).toBe(expected);
    expect(pkce.method).toBe("S256");
  });

  it("produces a verifier of legal length and charset", () => {
    const { verifier } = createPkce();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it("is fresh every call", () => {
    expect(createPkce().verifier).not.toBe(createPkce().verifier);
    expect(createState()).not.toBe(createState());
  });
});

describe("authorization URL", () => {
  const base = {
    clientId: "cid.apps.googleusercontent.com",
    redirectUri: "http://127.0.0.1:5599/oauth/callback",
    pkce: createPkce(),
    state: "st4te",
  };

  it("asks Google for offline access, or the assistant dies in an hour", () => {
    // Without access_type=offline AND prompt=consent Google returns an access
    // token and no refresh token.
    const u = new URL(buildAuthorizeUrl({ ...base, provider: "google" }));
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
    expect(u.searchParams.get("scope")).toBe("https://mail.google.com/");
  });

  it("asks Microsoft for offline_access and only the mail scopes", () => {
    const u = new URL(buildAuthorizeUrl({ ...base, provider: "microsoft" }));
    const scopes = (u.searchParams.get("scope") ?? "").split(" ");
    expect(scopes).toContain("offline_access");
    expect(scopes).toContain("https://outlook.office.com/IMAP.AccessAsUser.All");
    expect(scopes).toContain("https://outlook.office.com/SMTP.Send");
    // access_type is Google's, not Microsoft's.
    expect(u.searchParams.get("access_type")).toBeNull();
  });

  it("carries PKCE and state, and never a client secret", () => {
    const u = new URL(buildAuthorizeUrl({ ...base, provider: "google" }));
    expect(u.searchParams.get("code_challenge")).toBe(base.pkce.challenge);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("state")).toBe("st4te");
    expect(u.searchParams.get("client_secret")).toBeNull();
  });

  it("pre-fills the account when the address is already known", () => {
    const u = new URL(buildAuthorizeUrl({ ...base, provider: "google", loginHint: "a@gmail.com" }));
    expect(u.searchParams.get("login_hint")).toBe("a@gmail.com");
  });
});

describe("loopback redirect", () => {
  it("captures the code the browser comes back with", async () => {
    const cap = await startLoopbackCapture({ expectedState: "abc", timeoutMs: 5_000 });
    expect(cap.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/oauth\/callback$/);
    const res = await realFetch(`${cap.redirectUri}?code=THECODE&state=abc`);
    expect(res.status).toBe(200);
    await expect(cap.code).resolves.toBe("THECODE");
  });

  it("refuses a redirect whose state does not match", async () => {
    // A mismatch is the signature of another process on the box racing the
    // browser, so it is refused rather than accepted and logged.
    const cap = await startLoopbackCapture({ expectedState: "abc", timeoutMs: 5_000 });
    const res = await realFetch(`${cap.redirectUri}?code=THECODE&state=wrong`);
    expect(res.status).toBe(400);
    await expect(cap.code).rejects.toThrow(/state mismatch/);
  });

  it("reports the user cancelling at the provider", async () => {
    const cap = await startLoopbackCapture({ expectedState: "abc", timeoutMs: 5_000 });
    await realFetch(`${cap.redirectUri}?error=access_denied&state=abc`);
    await expect(cap.code).rejects.toThrow(/access_denied/);
  });

  it("binds loopback only", async () => {
    const cap = await startLoopbackCapture({ expectedState: "abc", timeoutMs: 5_000 });
    expect(new URL(cap.redirectUri).hostname).toBe("127.0.0.1");
    cap.close();
  });
});

describe("token exchange", () => {
  it("sends the verifier and no client secret", async () => {
    const forms = stubToken({ access_token: "AT", refresh_token: "RT", expires_in: 3600 });
    await exchangeCode({
      provider: "google",
      clientId: "cid",
      code: "CODE",
      redirectUri: "http://127.0.0.1:1/oauth/callback",
      codeVerifier: "VERIFIER",
    });
    expect(forms[0].code_verifier).toBe("VERIFIER");
    expect(forms[0].grant_type).toBe("authorization_code");
    expect(forms[0]).not.toHaveProperty("client_secret");
  });

  it("expires the token early so a reconnect cannot race it", async () => {
    stubToken({ access_token: "AT", expires_in: 3600 });
    const before = Date.now();
    const t = await exchangeCode({
      provider: "google",
      clientId: "cid",
      code: "CODE",
      redirectUri: "http://127.0.0.1:1/cb",
      codeVerifier: "V",
    });
    expect(t.expiresAt).toBeLessThanOrEqual(before + 3600_000 - 60_000 + 50);
  });

  it("carries the old refresh token forward when the provider omits one", async () => {
    // Google reissues an access token without a refresh token; losing the
    // original would mean the assistant can never refresh again.
    stubToken({ access_token: "AT2", expires_in: 3600 });
    const t = await refreshTokens({ provider: "google", clientId: "cid", refreshToken: "RT" });
    expect(t.accessToken).toBe("AT2");
    expect(t.refreshToken).toBe("RT");
  });

  it("prefers a rotated refresh token when the provider sends one", async () => {
    stubToken({ access_token: "AT2", refresh_token: "RT2", expires_in: 3600 });
    const t = await refreshTokens({ provider: "microsoft", clientId: "cid", refreshToken: "RT" });
    expect(t.refreshToken).toBe("RT2");
  });

  it("reports the provider error code without echoing the body", async () => {
    stubToken({ error: "invalid_grant", error_description: "Token has been expired" }, 400);
    await expect(
      refreshTokens({ provider: "google", clientId: "cid", refreshToken: "RT" }),
    ).rejects.toThrow(/invalid_grant/);
  });
});

describe("token lifetime and SASL", () => {
  it("knows when a refresh is due", () => {
    expect(needsRefresh({ expiresAt: 1000 }, 999)).toBe(false);
    expect(needsRefresh({ expiresAt: 1000 }, 1000)).toBe(true);
  });

  it("encodes XOAUTH2 exactly as the SASL mechanism requires", () => {
    const decoded = Buffer.from(xoauth2Token("a@b.c", "TOK"), "base64").toString("utf8");
    // Separators are U+0001, and the value ends with two of them.
    const SEP = "\u0001";
    expect(decoded).toBe(`user=a@b.c${SEP}auth=Bearer TOK${SEP}${SEP}`);
  });
});
