import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedGoogleChatAccount } from "./accounts.js";
import { downloadGoogleChatMedia, sendGoogleChatMessage } from "./api.js";
import { resolveGoogleChatGroupRequireMention } from "./group-policy.js";
import { isSenderAllowed } from "./sender-allow.js";
import {
  isGoogleChatSpaceTarget,
  isGoogleChatUserTarget,
  normalizeGoogleChatTarget,
} from "./targets.js";

const mocks = vi.hoisted(() => ({
  buildHostnameAllowlistPolicyFromSuffixAllowlist: vi.fn((hosts: string[]) => ({
    hostnameAllowlist: hosts,
  })),
  fetchWithSsrFGuard: vi.fn(async (params: { url: string; init?: RequestInit }) => ({
    response: await fetch(params.url, params.init),
    release: async () => {},
  })),
  getGoogleChatAccessToken: vi.fn().mockResolvedValue("token"),
}));

vi.mock("@enclawed/plugin-sdk/ssrf-runtime", () => {
  return {
    buildHostnameAllowlistPolicyFromSuffixAllowlist:
      mocks.buildHostnameAllowlistPolicyFromSuffixAllowlist,
    fetchWithSsrFGuard: mocks.fetchWithSsrFGuard,
  };
});

vi.mock("./auth.js", async () => {
  const actual = await vi.importActual<typeof import("./auth.js")>("./auth.js");
  return {
    ...actual,
    getGoogleChatAccessToken: mocks.getGoogleChatAccessToken,
  };
});

const authActual = await vi.importActual<typeof import("./auth.js")>("./auth.js");
const { __testing: authTesting, getGoogleChatAccessToken, verifyGoogleChatRequest } = authActual;

const account = {
  accountId: "default",
  enabled: true,
  credentialSource: "inline",
  config: {},
} as ResolvedGoogleChatAccount;

function stubSuccessfulSend(name: string) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ name }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function expectDownloadToRejectForResponse(response: Response) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  await expect(
    downloadGoogleChatMedia({ account, resourceName: "media/123", maxBytes: 10 }),
  ).rejects.toThrow(/max bytes/i);
}

describe("normalizeGoogleChatTarget", () => {
  it("normalizes provider prefixes", () => {
    expect(normalizeGoogleChatTarget("googlechat:users/123")).toBe("users/123");
    expect(normalizeGoogleChatTarget("google-chat:spaces/AAA")).toBe("spaces/AAA");
    expect(normalizeGoogleChatTarget("gchat:user:User@Example.com")).toBe("users/user@example.com");
  });

  it("normalizes email targets to users/<email>", () => {
    expect(normalizeGoogleChatTarget("User@Example.com")).toBe("users/user@example.com");
    expect(normalizeGoogleChatTarget("users/User@Example.com")).toBe("users/user@example.com");
  });

  it("preserves space targets", () => {
    expect(normalizeGoogleChatTarget("space:spaces/BBB")).toBe("spaces/BBB");
    expect(normalizeGoogleChatTarget("spaces/CCC")).toBe("spaces/CCC");
  });
});

describe("target helpers", () => {
  it("detects user and space targets", () => {
    expect(isGoogleChatUserTarget("users/abc")).toBe(true);
    expect(isGoogleChatSpaceTarget("spaces/abc")).toBe(true);
    expect(isGoogleChatUserTarget("spaces/abc")).toBe(false);
  });
});

describe("googlechat group policy", () => {
  it("uses generic channel group policy helpers", () => {
    const cfg = {
      channels: {
        googlechat: {
          groups: {
            "spaces/AAA": {
              requireMention: false,
            },
            "*": {
              requireMention: true,
            },
          },
        },
      },
    } as any;

    expect(resolveGoogleChatGroupRequireMention({ cfg, groupId: "spaces/AAA" })).toBe(false);
    expect(resolveGoogleChatGroupRequireMention({ cfg, groupId: "spaces/BBB" })).toBe(true);
  });
});

describe("isSenderAllowed", () => {
  it("matches raw email entries only when dangerous name matching is enabled", () => {
    expect(isSenderAllowed("users/123", "Jane@Example.com", ["jane@example.com"])).toBe(false);
    expect(isSenderAllowed("users/123", "Jane@Example.com", ["jane@example.com"], true)).toBe(true);
  });

  it("does not treat users/<email> entries as email allowlist (deprecated form)", () => {
    expect(isSenderAllowed("users/123", "Jane@Example.com", ["users/jane@example.com"])).toBe(
      false,
    );
  });

  it("still matches user id entries", () => {
    expect(isSenderAllowed("users/abc", "jane@example.com", ["users/abc"])).toBe(true);
  });

  it("rejects non-matching raw email entries", () => {
    expect(isSenderAllowed("users/123", "jane@example.com", ["other@example.com"], true)).toBe(
      false,
    );
  });
});

describe("downloadGoogleChatMedia", () => {
  afterEach(() => {
    authTesting.resetGoogleChatAuthForTests();
    mocks.fetchWithSsrFGuard.mockClear();
    vi.unstubAllGlobals();
  });

  it("rejects when content-length exceeds max bytes", async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    const response = new Response(body, {
      status: 200,
      headers: { "content-length": "50", "content-type": "application/octet-stream" },
    });
    await expectDownloadToRejectForResponse(response);
  });

  it("rejects when streamed payload exceeds max bytes", async () => {
    const chunks = [new Uint8Array(6), new Uint8Array(6)];
    let index = 0;
    const body = new ReadableStream({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(chunks[index++]);
        } else {
          controller.close();
        }
      },
    });
    const response = new Response(body, {
      status: 200,
      headers: { "content-type": "application/octet-stream" },
    });
    await expectDownloadToRejectForResponse(response);
  });
});

describe("sendGoogleChatMessage", () => {
  afterEach(() => {
    authTesting.resetGoogleChatAuthForTests();
    mocks.fetchWithSsrFGuard.mockClear();
    vi.unstubAllGlobals();
  });

  it("adds messageReplyOption when sending to an existing thread", async () => {
    const fetchMock = stubSuccessfulSend("spaces/AAA/messages/123");

    await sendGoogleChatMessage({
      account,
      space: "spaces/AAA",
      text: "hello",
      thread: "spaces/AAA/threads/xyz",
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain("messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      text: "hello",
      thread: { name: "spaces/AAA/threads/xyz" },
    });
  });

  it("does not set messageReplyOption for non-thread sends", async () => {
    const fetchMock = stubSuccessfulSend("spaces/AAA/messages/124");

    await sendGoogleChatMessage({
      account,
      space: "spaces/AAA",
      text: "hello",
    });

    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).not.toContain("messageReplyOption=");
  });
});

const { privateKey: signingKey, publicKey: signingPublicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const { privateKey: saPrivateKey, publicKey: saPublicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const SIGNING_PUBLIC_PEM = signingPublicKey.export({ type: "spki", format: "pem" }) as string;
const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v1/certs";
const CHAT_CERTS_URL =
  "https://www.googleapis.com/service_accounts/v1/metadata/x509/chat@system.gserviceaccount.com";

function signToken(payload: Record<string, unknown>, kid = "kid-1"): string {
  const nowSecs = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid, typ: "JWT" })).toString(
    "base64url",
  );
  const body = Buffer.from(
    JSON.stringify({ iat: nowSecs - 5, exp: nowSecs + 3600, ...payload }),
  ).toString("base64url");
  const signature = crypto.sign("sha256", Buffer.from(`${header}.${body}`), signingKey);
  return `${header}.${body}.${signature.toString("base64url")}`;
}

function serveCerts(url: string, release = vi.fn()) {
  mocks.fetchWithSsrFGuard.mockImplementation(async (params: { url: string }) => {
    if (params.url !== url) {
      throw new Error(`unexpected fetch ${params.url}`);
    }
    return {
      response: new Response(JSON.stringify({ "kid-1": SIGNING_PUBLIC_PEM }), {
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "max-age=300" },
      }),
      release,
    };
  });
  return release;
}

function appUrlToken(payload: Record<string, unknown>): string {
  return signToken({
    aud: "https://example.com/googlechat",
    iss: "https://accounts.google.com",
    email_verified: true,
    ...payload,
  });
}

describe("verifyGoogleChatRequest", () => {
  afterEach(() => {
    authTesting.resetGoogleChatAuthForTests();
    mocks.fetchWithSsrFGuard.mockReset();
  });

  it("mints service-account access tokens through the guarded Google auth fetch", async () => {
    const bodies: string[] = [];
    mocks.fetchWithSsrFGuard.mockImplementation(
      async (params: { url: string; init?: RequestInit; auditContext?: string }) => {
        expect(params.url).toBe("https://oauth2.googleapis.com/token");
        expect(params.auditContext).toBe("googlechat.auth.google-auth");
        const body = params.init?.body;
        bodies.push(typeof body === "string" ? body : "");
        return {
          response: new Response(
            JSON.stringify({ access_token: "access-token", expires_in: 3600 }),
            {
              status: 200,
            },
          ),
          release: async () => {},
        };
      },
    );
    const credentialAccount = {
      ...account,
      credentials: {
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        client_email: "bot@example.iam.gserviceaccount.com",
        private_key: saPrivateKey.export({ type: "pkcs8", format: "pem" }) as string,
        token_uri: "https://oauth2.googleapis.com/token",
        type: "service_account",
        universe_domain: "googleapis.com",
      },
    };

    await expect(getGoogleChatAccessToken(credentialAccount)).resolves.toBe("access-token");
    await expect(getGoogleChatAccessToken(credentialAccount)).resolves.toBe("access-token");

    expect(bodies).toHaveLength(1);
    const assertion = new URLSearchParams(bodies[0]).get("assertion") ?? "";
    const [header, payload, signature] = assertion.split(".") as [string, string, string];
    expect(
      crypto.verify(
        "sha256",
        Buffer.from(`${header}.${payload}`),
        saPublicKey,
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
    expect(JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))).toMatchObject({
      iss: "bot@example.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/chat.bot",
    });
    expect("window" in globalThis).toBe(false);
  });

  it("refuses to mint tokens without configured credentials instead of using ambient ADC", async () => {
    await expect(getGoogleChatAccessToken(account)).rejects.toThrow(
      "Google Chat credentials are missing.",
    );
    expect(mocks.fetchWithSsrFGuard).not.toHaveBeenCalled();
  });

  it("accepts Google Chat app-url tokens from the Chat issuer", async () => {
    serveCerts(GOOGLE_CERTS_URL);
    await expect(
      verifyGoogleChatRequest({
        bearer: appUrlToken({ email: "chat@system.gserviceaccount.com" }),
        audienceType: "app-url",
        audience: "https://example.com/googlechat",
      }),
    ).resolves.toEqual({ ok: true });
    expect(mocks.fetchWithSsrFGuard.mock.calls[0]?.[0]).toMatchObject({
      url: GOOGLE_CERTS_URL,
      auditContext: "googlechat.auth.google-auth",
    });
  });

  it("rejects app-url tokens whose email is not verified", async () => {
    serveCerts(GOOGLE_CERTS_URL);
    await expect(
      verifyGoogleChatRequest({
        bearer: appUrlToken({ email: "chat@system.gserviceaccount.com", email_verified: "true" }),
        audienceType: "app-url",
        audience: "https://example.com/googlechat",
      }),
    ).resolves.toEqual({ ok: false, reason: "email not verified" });
  });

  it("rejects app-url tokens for another audience or issuer", async () => {
    serveCerts(GOOGLE_CERTS_URL);
    const wrongAudience = await verifyGoogleChatRequest({
      bearer: appUrlToken({ email: "chat@system.gserviceaccount.com", aud: "https://evil" }),
      audienceType: "app-url",
      audience: "https://example.com/googlechat",
    });
    expect(wrongAudience.ok).toBe(false);
    const wrongIssuer = await verifyGoogleChatRequest({
      bearer: appUrlToken({ email: "chat@system.gserviceaccount.com", iss: "https://evil" }),
      audienceType: "app-url",
      audience: "https://example.com/googlechat",
    });
    expect(wrongIssuer.ok).toBe(false);
  });

  it("rejects add-on tokens when no principal binding is configured", async () => {
    serveCerts(GOOGLE_CERTS_URL);
    await expect(
      verifyGoogleChatRequest({
        bearer: appUrlToken({
          email: "service-123@gcp-sa-gsuiteaddons.iam.gserviceaccount.com",
          sub: "principal-1",
        }),
        audienceType: "app-url",
        audience: "https://example.com/googlechat",
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "missing add-on principal binding",
    });
  });

  it("accepts add-on tokens only when the bound principal matches", async () => {
    serveCerts(GOOGLE_CERTS_URL);
    await expect(
      verifyGoogleChatRequest({
        bearer: appUrlToken({
          email: "service-123@gcp-sa-gsuiteaddons.iam.gserviceaccount.com",
          sub: "principal-1",
        }),
        audienceType: "app-url",
        audience: "https://example.com/googlechat",
        expectedAddOnPrincipal: "principal-1",
      }),
    ).resolves.toEqual({ ok: true });
  });

  it("rejects add-on tokens when the bound principal does not match", async () => {
    serveCerts(GOOGLE_CERTS_URL);
    await expect(
      verifyGoogleChatRequest({
        bearer: appUrlToken({
          email: "service-123@gcp-sa-gsuiteaddons.iam.gserviceaccount.com",
          sub: "principal-2",
        }),
        audienceType: "app-url",
        audience: "https://example.com/googlechat",
        expectedAddOnPrincipal: "principal-1",
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "unexpected add-on principal: principal-2",
    });
  });

  it("verifies project-number tokens against the Chat certs fetched through the guard", async () => {
    const release = serveCerts(CHAT_CERTS_URL);
    const token = signToken({ aud: "123456789", iss: "chat@system.gserviceaccount.com" });

    await expect(
      verifyGoogleChatRequest({
        bearer: token,
        audienceType: "project-number",
        audience: "123456789",
      }),
    ).resolves.toEqual({ ok: true });

    expect(mocks.fetchWithSsrFGuard).toHaveBeenCalledWith({
      url: CHAT_CERTS_URL,
      auditContext: "googlechat.auth.certs",
    });
    expect(release).toHaveBeenCalledOnce();
  });

  it("rejects project-number tokens from other issuers, audiences, or keys", async () => {
    serveCerts(CHAT_CERTS_URL);
    const results = await Promise.all([
      verifyGoogleChatRequest({
        bearer: signToken({ aud: "123456789", iss: "https://accounts.google.com" }),
        audienceType: "project-number",
        audience: "123456789",
      }),
      verifyGoogleChatRequest({
        bearer: signToken({ aud: "987654321", iss: "chat@system.gserviceaccount.com" }),
        audienceType: "project-number",
        audience: "123456789",
      }),
      verifyGoogleChatRequest({
        bearer: signToken({ aud: "123456789", iss: "chat@system.gserviceaccount.com" }, "kid-9"),
        audienceType: "project-number",
        audience: "123456789",
      }),
    ]);
    expect(results.map((result) => result.ok)).toEqual([false, false, false]);
  });
});
