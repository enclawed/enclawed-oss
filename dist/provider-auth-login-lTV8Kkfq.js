import { r as loadBundledPluginPublicSurfaceModuleSync } from "./facade-loader-C3J-_dvo.js";
import { n as createLazyRuntimeMethodBinder, r as createLazyRuntimeModule } from "./lazy-runtime-CTKnZsG3.js";
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
const bindProviderAuthLoginRuntime = createLazyRuntimeMethodBinder(createLazyRuntimeModule(() => import("./provider-auth-login.runtime-CX_xcOfe.js")));
const loginChutes = bindProviderAuthLoginRuntime((runtime) => runtime.loginChutes);
const loginOpenAICodexOAuth = bindProviderAuthLoginRuntime((runtime) => runtime.loginOpenAICodexOAuth);
//#endregion
export { loginOpenAICodexOAuth as n, githubCopilotLoginCommand as r, loginChutes as t };
