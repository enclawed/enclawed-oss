import {
  listProfilesForProvider,
  loadAuthProfileStoreForRuntime,
} from "@enclawed/plugin-sdk/agent-runtime";
import { resolveEnvApiKey } from "@enclawed/plugin-sdk/provider-auth";

const QA_CODEX_OAUTH_LIVE_MODEL = "openai-codex/gpt-5.4";

export function resolveQaLiveFrontierPreferredModel() {
  if (resolveEnvApiKey("openai")?.apiKey) {
    return undefined;
  }
  try {
    const store = loadAuthProfileStoreForRuntime(undefined, {
      readOnly: true,
      allowKeychainPrompt: false,
    });
    if (listProfilesForProvider(store, "openai").length > 0) {
      return undefined;
    }
    return listProfilesForProvider(store, "openai-codex").length > 0
      ? QA_CODEX_OAUTH_LIVE_MODEL
      : undefined;
  } catch {
    return undefined;
  }
}
