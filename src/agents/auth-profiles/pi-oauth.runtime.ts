import type { OAuthAuth, Provider } from "@mariozechner/pi-ai";
import { anthropicProvider } from "@mariozechner/pi-ai/providers/anthropic";
import { githubCopilotProvider } from "@mariozechner/pi-ai/providers/github-copilot";
import { openaiCodexProvider } from "@mariozechner/pi-ai/providers/openai-codex";
import type { PiOAuthProviderId } from "./pi-oauth.providers.js";

// Lazy boundary: provider modules (and their model catalogs) load only when a
// refresh actually needs pi-ai's OAuth flow.
const PI_OAUTH_PROVIDER_FACTORIES: Record<PiOAuthProviderId, () => Provider> = {
  anthropic: anthropicProvider,
  "github-copilot": githubCopilotProvider,
  "openai-codex": openaiCodexProvider,
};

export function resolvePiOAuthAuth(provider: PiOAuthProviderId): OAuthAuth {
  const oauth = PI_OAUTH_PROVIDER_FACTORIES[provider]().auth.oauth;
  if (!oauth) {
    throw new Error(`pi-ai provider ${provider} does not expose OAuth`);
  }
  return oauth;
}
