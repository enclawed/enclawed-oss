import { n as resolveAwsSdkEnvVarName } from "./model-auth-runtime-shared-BY5ycfWX.js";
import "./provider-auth-runtime-6k3b1NdB.js";
//#region extensions/amazon-bedrock/discovery-shared.ts
function resolveBedrockConfigApiKey(env = process.env) {
	return resolveAwsSdkEnvVarName(env);
}
function mergeImplicitBedrockProvider(params) {
	const { existing, implicit } = params;
	if (!existing) return implicit;
	return {
		...implicit,
		...existing,
		models: Array.isArray(existing.models) && existing.models.length > 0 ? existing.models : implicit.models
	};
}
//#endregion
export { resolveBedrockConfigApiKey as n, mergeImplicitBedrockProvider as t };
