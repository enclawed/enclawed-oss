import { r as loadBundledPluginPublicSurfaceModuleSync } from "./facade-loader-D0gBcJtr.js";
import { n as createLazyRuntimeMethodBinder, r as createLazyRuntimeModule } from "./lazy-runtime-D5abDpg4.js";
//#region src/plugin-sdk/github-copilot-login.ts
function loadFacadeModule() {
	return loadBundledPluginPublicSurfaceModuleSync({
		dirName: "github-copilot",
		artifactBasename: "api.js"
	});
}
const githubCopilotLoginCommand = ((...args) => loadFacadeModule()["githubCopilotLoginCommand"](...args));
//#endregion
//#region src/plugin-sdk/provider-auth-login.ts
const bindProviderAuthLoginRuntime = createLazyRuntimeMethodBinder(createLazyRuntimeModule(() => import("./provider-auth-login.runtime-B7bEYw20.js")));
const loginChutes = bindProviderAuthLoginRuntime((runtime) => runtime.loginChutes);
const loginOpenAICodexOAuth = bindProviderAuthLoginRuntime((runtime) => runtime.loginOpenAICodexOAuth);
//#endregion
export { loginOpenAICodexOAuth as n, githubCopilotLoginCommand as r, loginChutes as t };
