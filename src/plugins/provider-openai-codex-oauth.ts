import { createServer } from "node:net";
import type {
  AuthEvent,
  AuthPrompt,
  OAuthAuth,
  ProviderAuthInteraction,
} from "@mariozechner/pi-ai";
import type { OAuthCredentials } from "@mariozechner/pi-ai/oauth";
import { openaiCodexProvider } from "@mariozechner/pi-ai/providers/openai-codex";
import { ensureGlobalUndiciEnvProxyDispatcher } from "../infra/net/undici-global-dispatcher.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { createVpsAwareOAuthHandlers } from "./provider-oauth-flow.js";
import {
  formatOpenAIOAuthTlsPreflightFix,
  runOpenAIOAuthTlsPreflight,
} from "./provider-openai-codex-oauth-tls.js";

const manualInputPromptMessage = "Paste the authorization code (or full redirect URL):";
// The `originator` OpenAI's Codex sign-in expects. "pi" is the value pi-ai's own
// flow and every Codex request it makes send (OPENAI_CODEX_REQUIRED_ORIGINATOR);
// it names no product or version, so the sign-in does not identify Enclawed.
const openAICodexOAuthOriginator = "pi";
// pi-ai's Codex browser flow listens for the OAuth redirect on this loopback
// port (shared with the Codex CLI) and falls back to a pasted redirect URL when
// it cannot bind it.
const openAICodexCallbackPort = 1455;
// Option id pi-ai's Codex OAuth `login()` offers for the browser (PKCE +
// loopback callback) flow. Enclawed's wizard has always used that flow here;
// the device-code flow is a separate auth method (runOpenAICodexDeviceCode).
const openAICodexBrowserLoginMethod = "browser";

function resolveOpenAICodexOAuth(): OAuthAuth {
  const oauth = openaiCodexProvider().auth.oauth;
  if (!oauth) {
    throw new Error("pi-ai openai-codex provider does not expose OAuth login");
  }
  return oauth;
}

/** Whether nothing currently listens on the loopback callback port. */
async function isLoopbackPortFree(host: string, port: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, host, () => {
      probe.close(() => resolve(true));
    });
  });
}

function waitForAbort(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    const rejectWithReason = () =>
      reject(signal.reason instanceof Error ? signal.reason : new Error("Prompt cancelled"));
    if (signal.aborted) {
      rejectWithReason();
      return;
    }
    signal.addEventListener("abort", rejectWithReason, { once: true });
  });
}

export async function loginOpenAICodexOAuth(params: {
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
  isRemote: boolean;
  openUrl: (url: string) => Promise<void>;
  localBrowserMessage?: string;
}): Promise<OAuthCredentials | null> {
  const { prompter, runtime, isRemote, openUrl, localBrowserMessage } = params;

  ensureGlobalUndiciEnvProxyDispatcher();

  const preflight = await runOpenAIOAuthTlsPreflight();
  if (!preflight.ok && preflight.kind === "tls-cert") {
    const hint = formatOpenAIOAuthTlsPreflightFix(preflight);
    runtime.log(hint);
    await prompter.note(hint, "OAuth prerequisites");
  }

  await prompter.note(
    isRemote
      ? [
          "You are running in a remote/VPS environment.",
          "A URL will be shown for you to open in your LOCAL browser.",
          "After signing in, paste the redirect URL back here.",
        ].join("\n")
      : [
          "Browser will open for OpenAI authentication.",
          "If the callback doesn't auto-complete, paste the redirect URL.",
          "OpenAI OAuth uses localhost:1455 for the callback.",
        ].join("\n"),
    "OpenAI Codex OAuth",
  );

  const spin = prompter.progress("Starting OAuth flow…");
  try {
    const { onAuth: baseOnAuth, onPrompt } = createVpsAwareOAuthHandlers({
      isRemote,
      prompter,
      runtime,
      spin,
      openUrl,
      localBrowserMessage: localBrowserMessage ?? "Complete sign-in in browser…",
      manualPromptMessage: manualInputPromptMessage,
    });

    // Local runs: wait for the loopback callback and ask for a pasted redirect
    // URL only when the callback cannot be received (port already taken), as
    // the pi-ai 0.80.2 flow did. pi-ai 1.x always races a `manual_code` prompt
    // against the callback and aborts it when the callback wins; a wizard text
    // prompt cannot be withdrawn once shown, so a local run only shows it when
    // pi-ai will not be able to bind the callback port. The probe uses pi-ai's
    // callback host (PI_OAUTH_CALLBACK_HOST, default 127.0.0.1).
    const callbackHost = process.env.PI_OAUTH_CALLBACK_HOST || "127.0.0.1";
    const callbackExpected =
      !isRemote && (await isLoopbackPortFree(callbackHost, openAICodexCallbackPort));

    const promptForManualCode = async (prompt: AuthPrompt): Promise<string> => {
      if (callbackExpected && prompt.signal) {
        return await waitForAbort(prompt.signal);
      }
      // Remote runs started this prompt when the authorize URL was shown.
      return await onPrompt({ message: manualInputPromptMessage });
    };

    const interaction: ProviderAuthInteraction = {
      // Enclawed has no out-of-band cancel for the wizard login; the flow ends
      // when pi-ai resolves or rejects.
      signal: new AbortController().signal,
      prompt: async (prompt) => {
        switch (prompt.type) {
          case "select": {
            if (prompt.options.some((option) => option.id === openAICodexBrowserLoginMethod)) {
              return openAICodexBrowserLoginMethod;
            }
            throw new Error(`Unsupported OpenAI Codex OAuth selection: ${prompt.message}`);
          }
          case "manual_code":
            return await promptForManualCode(prompt);
          case "text":
          case "secret":
            return await onPrompt({ message: prompt.message, placeholder: prompt.placeholder });
          default:
            // Fail closed on a prompt kind this flow does not know how to answer.
            throw new Error("Unsupported OpenAI Codex OAuth prompt");
        }
      },
      notify: (event: AuthEvent) => {
        switch (event.type) {
          case "auth_url":
            baseOnAuth({ url: event.url }).catch((err: unknown) => {
              runtime.error(`Failed to open the OpenAI sign-in URL: ${String(err)}`);
            });
            return;
          case "progress":
          case "info":
            spin.update(event.message);
            return;
          case "device_code":
            runtime.log(`Open ${event.verificationUri} and enter code ${event.userCode}`);
            return;
        }
      },
    };

    // pi-ai returns the credential only; Enclawed persists it in its own auth
    // profiles (no pi CredentialStore / auth.json is involved).
    const creds: OAuthCredentials = await resolveOpenAICodexOAuth().login(interaction, {
      agentName: openAICodexOAuthOriginator,
    });
    spin.stop("OpenAI OAuth complete");
    return creds;
  } catch (err) {
    spin.stop("OpenAI OAuth failed");
    runtime.error(String(err));
    await prompter.note(
      "Trouble with OAuth? See https://github.com/enclawed/enclawed-oss/blob/main/docs/help/faq.md",
      "OAuth help",
    );
    throw err;
  }
}
