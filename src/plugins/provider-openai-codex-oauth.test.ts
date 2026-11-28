import { EventEmitter } from "node:events";
import type {
  AuthEvent,
  AuthInteraction,
  AuthPrompt,
  LoginOptions,
  OAuthCredential,
} from "@mariozechner/pi-ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";

type PiCodexLogin = (
  interaction: AuthInteraction,
  options?: LoginOptions,
) => Promise<OAuthCredential>;

const mocks = vi.hoisted(() => ({
  login: vi.fn<PiCodexLogin>(),
  loopbackPortFree: { value: true },
  runOpenAIOAuthTlsPreflight: vi.fn(),
  formatOpenAIOAuthTlsPreflightFix: vi.fn(),
}));

vi.mock("@mariozechner/pi-ai/providers/openai-codex", () => ({
  openaiCodexProvider: () => ({
    id: "openai-codex",
    auth: {
      oauth: {
        name: "OpenAI (ChatGPT Plus/Pro)",
        login: mocks.login,
        refresh: vi.fn(),
        toAuth: vi.fn(),
      },
    },
  }),
}));

// Deterministic stand-in for the loopback callback-port probe.
vi.mock("node:net", () => ({
  createServer: () => {
    const probe = new EventEmitter();
    return Object.assign(probe, {
      listen: (_port: number, _host: string, onListening: () => void) => {
        queueMicrotask(() => {
          if (mocks.loopbackPortFree.value) {
            onListening();
          } else {
            probe.emit("error", new Error("EADDRINUSE"));
          }
        });
      },
      close: (onClosed: () => void) => {
        queueMicrotask(onClosed);
      },
    });
  },
}));

vi.mock("./provider-openai-codex-oauth-tls.js", () => ({
  runOpenAIOAuthTlsPreflight: mocks.runOpenAIOAuthTlsPreflight,
  formatOpenAIOAuthTlsPreflightFix: mocks.formatOpenAIOAuthTlsPreflightFix,
}));

import { loginOpenAICodexOAuth } from "./provider-openai-codex-oauth.js";

function codexCredential(): OAuthCredential {
  return {
    type: "oauth",
    access: "access-token",
    refresh: "refresh-token",
    expires: Date.now() + 60_000,
    accountId: "account-123",
  };
}

function manualCodePrompt(signal: AbortSignal): AuthPrompt {
  return {
    type: "manual_code",
    message: "Complete login in your browser, or paste the authorization code / redirect URL here:",
    signal,
  };
}

async function notifyAuthUrl(interaction: AuthInteraction, url: string): Promise<void> {
  interaction.notify({ type: "auth_url", url });
  // Let the async URL handler (open browser, log) settle like a real flow would.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function createPrompter() {
  const spin = { update: vi.fn(), stop: vi.fn() };
  const prompter: Pick<WizardPrompter, "note" | "progress" | "text"> = {
    note: vi.fn(async () => {}),
    progress: vi.fn(() => spin),
    text: vi.fn(async () => "http://localhost:1455/auth/callback?code=test"),
  };
  return { prompter: prompter as unknown as WizardPrompter, spin };
}

function createRuntime(): RuntimeEnv {
  return {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn((code: number) => {
      throw new Error(`exit:${code}`);
    }),
  };
}

async function runCodexOAuth(params: {
  isRemote: boolean;
  openUrl?: (url: string) => Promise<void>;
}) {
  const { prompter, spin } = createPrompter();
  const runtime = createRuntime();
  const result = await loginOpenAICodexOAuth({
    prompter,
    runtime,
    isRemote: params.isRemote,
    openUrl: params.openUrl ?? (async () => {}),
  });
  return { result, prompter, spin, runtime };
}

describe("loginOpenAICodexOAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loopbackPortFree.value = true;
    mocks.runOpenAIOAuthTlsPreflight.mockResolvedValue({ ok: true });
    mocks.formatOpenAIOAuthTlsPreflightFix.mockReturnValue("tls fix");
  });

  it("returns credentials on successful oauth login", async () => {
    const creds: OAuthCredential = {
      type: "oauth",
      access: "access-token",
      refresh: "refresh-token",
      expires: Date.now() + 60_000,
      email: "user@example.com",
    };
    mocks.login.mockResolvedValue(creds);

    const { result, spin, runtime } = await runCodexOAuth({ isRemote: false });

    expect(result).toEqual(creds);
    expect(mocks.login).toHaveBeenCalledOnce();
    expect(mocks.login).toHaveBeenCalledWith(expect.any(Object), { agentName: "pi" });
    expect(spin.stop).toHaveBeenCalledWith("OpenAI OAuth complete");
    expect(runtime.error).not.toHaveBeenCalled();
  });

  it("passes through Pi-provided authorize URLs without mutation", async () => {
    const creds: OAuthCredential = {
      type: "oauth",
      access: "access-token",
      refresh: "refresh-token",
      expires: Date.now() + 60_000,
      email: "user@example.com",
    };
    mocks.login.mockImplementation(async (interaction) => {
      await notifyAuthUrl(
        interaction,
        "https://auth.openai.com/oauth/authorize?scope=openid+profile+email+offline_access&state=abc",
      );
      return creds;
    });

    const openUrl = vi.fn(async () => {});
    const { runtime } = await runCodexOAuth({ isRemote: false, openUrl });

    expect(openUrl).toHaveBeenCalledWith(
      "https://auth.openai.com/oauth/authorize?scope=openid+profile+email+offline_access&state=abc",
    );
    expect(runtime.log).toHaveBeenCalledWith(
      "Open: https://auth.openai.com/oauth/authorize?scope=openid+profile+email+offline_access&state=abc",
    );
  });

  it("preserves authorize urls that omit scope", async () => {
    const creds: OAuthCredential = {
      type: "oauth",
      access: "access-token",
      refresh: "refresh-token",
      expires: Date.now() + 60_000,
      email: "user@example.com",
    };
    mocks.login.mockImplementation(async (interaction) => {
      await notifyAuthUrl(interaction, "https://auth.openai.com/oauth/authorize?state=abc");
      return creds;
    });

    const openUrl = vi.fn(async () => {});
    await runCodexOAuth({ isRemote: false, openUrl });

    expect(openUrl).toHaveBeenCalledWith("https://auth.openai.com/oauth/authorize?state=abc");
  });

  it("preserves slash-terminated authorize paths too", async () => {
    const creds: OAuthCredential = {
      type: "oauth",
      access: "access-token",
      refresh: "refresh-token",
      expires: Date.now() + 60_000,
      email: "user@example.com",
    };
    mocks.login.mockImplementation(async (interaction) => {
      await notifyAuthUrl(interaction, "https://auth.openai.com/oauth/authorize/?state=abc");
      return creds;
    });

    const openUrl = vi.fn(async () => {});
    await runCodexOAuth({ isRemote: false, openUrl });

    expect(openUrl).toHaveBeenCalledWith("https://auth.openai.com/oauth/authorize/?state=abc");
  });

  it("reports oauth errors and rethrows", async () => {
    mocks.login.mockRejectedValue(new Error("oauth failed"));

    const { prompter, spin } = createPrompter();
    const runtime = createRuntime();
    await expect(
      loginOpenAICodexOAuth({
        prompter,
        runtime,
        isRemote: true,
        openUrl: async () => {},
      }),
    ).rejects.toThrow("oauth failed");

    expect(spin.stop).toHaveBeenCalledWith("OpenAI OAuth failed");
    expect(runtime.error).toHaveBeenCalledWith(expect.stringContaining("oauth failed"));
    expect(prompter.note).toHaveBeenCalledWith(
      "Trouble with OAuth? See https://github.com/enclawed/enclawed-oss/blob/main/docs/help/faq.md",
      "OAuth help",
    );
  });

  it("answers pi's login-method selection with the browser flow", async () => {
    let selected: string | undefined;
    mocks.login.mockImplementation(async (interaction) => {
      selected = await interaction.prompt({
        type: "select",
        message: "Select OpenAI Codex login method:",
        options: [
          { id: "browser", label: "Browser login (default)" },
          { id: "device_code", label: "Device code login (headless)" },
        ],
      });
      return codexCredential();
    });

    const { prompter } = await runCodexOAuth({ isRemote: false });

    expect(selected).toBe("browser");
    expect(prompter.text).not.toHaveBeenCalled();
  });

  it("races the pasted redirect URL against the callback for remote oauth flows", async () => {
    const creds = codexCredential();
    mocks.login.mockImplementation(async (interaction) => {
      await notifyAuthUrl(interaction, "https://auth.openai.com/oauth/authorize?state=abc");
      const manual = await interaction.prompt(manualCodePrompt(new AbortController().signal));
      expect(manual).toContain("code=test");
      return creds;
    });

    const { result, prompter } = await runCodexOAuth({ isRemote: true });

    expect(result).toEqual(creds);
    expect(prompter.text).toHaveBeenCalledOnce();
    expect(prompter.text).toHaveBeenCalledWith({
      message: "Paste the authorization code (or full redirect URL):",
      validate: expect.any(Function),
    });
  });

  it("waits for the loopback callback without prompting on local oauth flows", async () => {
    const creds = codexCredential();
    mocks.login.mockImplementation(async (interaction) => {
      await notifyAuthUrl(interaction, "https://auth.openai.com/oauth/authorize?state=abc");
      const manualAbort = new AbortController();
      const manual = interaction.prompt(manualCodePrompt(manualAbort.signal));
      // pi-ai aborts the manual prompt once the browser callback delivered the code.
      manualAbort.abort();
      await expect(manual).rejects.toThrow();
      return creds;
    });

    const { result, prompter } = await runCodexOAuth({ isRemote: false });

    expect(result).toEqual(creds);
    expect(prompter.text).not.toHaveBeenCalled();
  });

  it("asks for the redirect URL on local flows when the callback port is taken", async () => {
    mocks.loopbackPortFree.value = false;
    const creds = codexCredential();
    mocks.login.mockImplementation(async (interaction) => {
      await notifyAuthUrl(interaction, "https://auth.openai.com/oauth/authorize?state=abc");
      const manual = await interaction.prompt(manualCodePrompt(new AbortController().signal));
      expect(manual).toContain("code=test");
      return creds;
    });

    const { result, prompter } = await runCodexOAuth({ isRemote: false });

    expect(result).toEqual(creds);
    expect(prompter.text).toHaveBeenCalledWith({
      message: "Paste the authorization code (or full redirect URL):",
      placeholder: undefined,
      validate: expect.any(Function),
    });
  });

  it("forwards pi progress events to the spinner", async () => {
    mocks.login.mockImplementation(async (interaction) => {
      const event: AuthEvent = { type: "progress", message: "Exchanging authorization code" };
      interaction.notify(event);
      return codexCredential();
    });

    const { spin } = await runCodexOAuth({ isRemote: false });

    expect(spin.update).toHaveBeenCalledWith("Exchanging authorization code");
  });

  it("continues OAuth flow on non-certificate preflight failures", async () => {
    const creds: OAuthCredential = {
      type: "oauth",
      access: "access-token",
      refresh: "refresh-token",
      expires: Date.now() + 60_000,
      email: "user@example.com",
    };
    mocks.runOpenAIOAuthTlsPreflight.mockResolvedValue({
      ok: false,
      kind: "network",
      message: "Client network socket disconnected before secure TLS connection was established",
    });
    mocks.login.mockResolvedValue(creds);

    const { result, prompter, runtime } = await runCodexOAuth({ isRemote: false });

    expect(result).toEqual(creds);
    expect(mocks.login).toHaveBeenCalledOnce();
    expect(runtime.error).not.toHaveBeenCalledWith("tls fix");
    expect(prompter.note).not.toHaveBeenCalledWith("tls fix", "OAuth prerequisites");
  });

  it("surfaces TLS preflight guidance but still attempts OAuth login", async () => {
    mocks.runOpenAIOAuthTlsPreflight.mockResolvedValue({
      ok: false,
      kind: "tls-cert",
      code: "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
      message: "unable to get local issuer certificate",
    });
    mocks.formatOpenAIOAuthTlsPreflightFix.mockReturnValue("Run brew postinstall openssl@3");
    const creds: OAuthCredential = {
      type: "oauth",
      access: "access-token",
      refresh: "refresh-token",
      expires: Date.now() + 60_000,
      email: "user@example.com",
    };
    mocks.login.mockResolvedValue(creds);

    const { prompter } = createPrompter();
    const runtime = createRuntime();

    await expect(
      loginOpenAICodexOAuth({
        prompter,
        runtime,
        isRemote: false,
        openUrl: async () => {},
      }),
    ).resolves.toEqual(creds);

    expect(mocks.login).toHaveBeenCalledOnce();
    expect(runtime.log).toHaveBeenCalledWith("Run brew postinstall openssl@3");
    expect(runtime.error).not.toHaveBeenCalledWith("Run brew postinstall openssl@3");
    expect(prompter.note).toHaveBeenCalledWith(
      "Run brew postinstall openssl@3",
      "OAuth prerequisites",
    );
  });
});
