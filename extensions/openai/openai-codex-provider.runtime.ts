import { ensureGlobalUndiciEnvProxyDispatcher } from "@enclawed/plugin-sdk/runtime-env";
import type { OAuthCredential } from "@mariozechner/pi-ai";
import { openaiCodexProvider } from "@mariozechner/pi-ai/providers/openai-codex";

/** The refresh-token exchange of pi-ai's OpenAI Codex OAuth flow. */
export type OpenAICodexTokenRefresh = (
  credential: OAuthCredential,
  signal: AbortSignal,
) => Promise<OAuthCredential>;

type OpenAICodexProviderRuntimeDeps = {
  ensureGlobalUndiciEnvProxyDispatcher: typeof ensureGlobalUndiciEnvProxyDispatcher;
  refreshOpenAICodexToken: OpenAICodexTokenRefresh;
};

export function createOpenAICodexProviderRuntime(deps: OpenAICodexProviderRuntimeDeps): {
  refreshOpenAICodexToken: typeof refreshOpenAICodexToken;
} {
  return {
    async refreshOpenAICodexToken(credential, signal) {
      deps.ensureGlobalUndiciEnvProxyDispatcher();
      return await deps.refreshOpenAICodexToken(credential, signal ?? new AbortController().signal);
    },
  };
}

// pi-ai 1.x exposes the Codex OAuth flow only through its provider definition
// (`Provider.auth.oauth`). The refresh is a pure token exchange: it returns the
// new credential to Enclawed, which persists it in its own auth profiles (no pi
// credential store, auth.json or ~/.pi path is involved).
const refreshWithPiCodexOAuth: OpenAICodexTokenRefresh = async (credential, signal) => {
  const oauth = openaiCodexProvider().auth.oauth;
  if (!oauth) {
    throw new Error("pi-ai openai-codex provider does not expose OAuth refresh");
  }
  return await oauth.refresh(credential, signal);
};

const runtime = createOpenAICodexProviderRuntime({
  ensureGlobalUndiciEnvProxyDispatcher,
  refreshOpenAICodexToken: refreshWithPiCodexOAuth,
});

export async function refreshOpenAICodexToken(
  credential: OAuthCredential,
  signal?: AbortSignal,
): Promise<OAuthCredential> {
  return await runtime.refreshOpenAICodexToken(credential, signal);
}
