// Public interactive auth/login helpers for provider plugins.

import { createLazyRuntimeMethodBinder, createLazyRuntimeModule } from "../shared/lazy-runtime.js";

type ProviderAuthLoginRuntime = typeof import("./provider-auth-login.runtime.js");

const loadProviderAuthLoginRuntime = createLazyRuntimeModule(
  () => import("./provider-auth-login.runtime.js"),
);
const bindProviderAuthLoginRuntime = createLazyRuntimeMethodBinder(loadProviderAuthLoginRuntime);

// githubCopilotLoginCommand is re-exported through the dedicated
// plugin-sdk/github-copilot-login facade, which lazy-loads the bundled
// github-copilot extension's runtime via the public-surface loader. Callers
// pulling provider-auth-login still get the login command via this re-export.
export { githubCopilotLoginCommand } from "./github-copilot-login.js";

export const loginChutes: ProviderAuthLoginRuntime["loginChutes"] = bindProviderAuthLoginRuntime(
  (runtime) => runtime.loginChutes,
);
export const loginOpenAICodexOAuth: ProviderAuthLoginRuntime["loginOpenAICodexOAuth"] =
  bindProviderAuthLoginRuntime((runtime) => runtime.loginOpenAICodexOAuth);
