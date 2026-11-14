import { d as resolveSecretInputRef, l as normalizeSecretInputString } from "./types.secrets-BXXJR1J4.js";
import { n as normalizeSecretInput } from "./normalize-secret-input-BH6BE5AN.js";
import "./common-DnjXvzpd.js";
import "./external-content-D1wu_onJ.js";
import "./web-fetch-utils-DOaT6y9r.js";
import { d as withStrictWebToolsEndpoint } from "./web-shared-C2NI51Oz.js";
import "./web-search-provider-common-B-SOn--r.js";
import "./enable-DttAORnw.js";
//#region src/agents/tools/web-search-citation-redirect.ts
const REDIRECT_TIMEOUT_MS = 5e3;
/**
* Resolve a citation redirect URL to its final destination using a HEAD request.
* Returns the original URL if resolution fails or times out.
*/
async function resolveCitationRedirectUrl(url) {
	try {
		return await withStrictWebToolsEndpoint({
			url,
			init: { method: "HEAD" },
			timeoutMs: REDIRECT_TIMEOUT_MS
		}, async ({ finalUrl }) => finalUrl || url);
	} catch {
		return url;
	}
}
//#endregion
//#region src/agents/tools/web-search-provider-credentials.ts
function resolveWebSearchProviderCredential(params) {
	const fromConfig = normalizeSecretInput(normalizeSecretInputString(params.credentialValue));
	if (fromConfig) return fromConfig;
	const credentialRef = resolveSecretInputRef({ value: params.credentialValue }).ref;
	if (credentialRef) {
		if (credentialRef.source === "env") return normalizeSecretInput(process.env[credentialRef.id]) || void 0;
		return;
	}
	for (const envVar of params.envVars) {
		const fromEnv = normalizeSecretInput(process.env[envVar]);
		if (fromEnv) return fromEnv;
	}
}
//#endregion
//#region src/plugin-sdk/provider-web-search.ts
/**
* @deprecated Implement provider-owned `createTool(...)` directly on the
* returned WebSearchProviderPlugin instead of routing through core.
*/
function createPluginBackedWebSearchProvider(provider) {
	return {
		...provider,
		createTool: () => {
			throw new Error(`createPluginBackedWebSearchProvider(${provider.id}) is no longer supported. Define provider-owned createTool(...) directly in the extension's WebSearchProviderPlugin.`);
		}
	};
}
//#endregion
export { resolveWebSearchProviderCredential as n, resolveCitationRedirectUrl as r, createPluginBackedWebSearchProvider as t };
