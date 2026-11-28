import { openaiCodexProvider } from "@mariozechner/pi-ai/providers/openai-codex";
import { anthropicProvider } from "@mariozechner/pi-ai/providers/anthropic";
import { githubCopilotProvider } from "@mariozechner/pi-ai/providers/github-copilot";
//#region src/agents/auth-profiles/pi-oauth.runtime.ts
const PI_OAUTH_PROVIDER_FACTORIES = {
	anthropic: anthropicProvider,
	"github-copilot": githubCopilotProvider,
	"openai-codex": openaiCodexProvider
};
function resolvePiOAuthAuth(provider) {
	const oauth = PI_OAUTH_PROVIDER_FACTORIES[provider]().auth.oauth;
	if (!oauth) throw new Error(`pi-ai provider ${provider} does not expose OAuth`);
	return oauth;
}
//#endregion
export { resolvePiOAuthAuth };
