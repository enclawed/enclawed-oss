import { s as normalizeOptionalString } from "./string-coerce-BUSzWgUA.js";
import { i as coerceSecretRef } from "./types.secrets-5qZ-WD40.js";
import { p as resolveNonEnvSecretRefApiKeyMarker } from "./model-auth-markers-HAPZYaGv.js";
import "./text-runtime-a81Cxtqz.js";
import "./provider-auth-YDU2Mel6.js";
import { a as resolveCloudflareAiGatewayBaseUrl, i as buildCloudflareAiGatewayModelDefinition } from "./models-BlbpSN5R.js";
//#region extensions/cloudflare-ai-gateway/catalog-provider.ts
function resolveCloudflareAiGatewayApiKey(cred) {
	if (!cred || cred.type !== "api_key") return;
	const keyRef = coerceSecretRef(cred.keyRef);
	const keyRefId = normalizeOptionalString(keyRef?.id);
	if (keyRef && keyRefId) return keyRef.source === "env" ? keyRefId : resolveNonEnvSecretRefApiKeyMarker(keyRef.source);
	return normalizeOptionalString(cred.key);
}
function resolveCloudflareAiGatewayMetadata(cred) {
	if (!cred || cred.type !== "api_key") return {};
	return {
		accountId: normalizeOptionalString(cred.metadata?.accountId),
		gatewayId: normalizeOptionalString(cred.metadata?.gatewayId)
	};
}
function buildCloudflareAiGatewayCatalogProvider(params) {
	const apiKey = normalizeOptionalString(params.envApiKey) ?? resolveCloudflareAiGatewayApiKey(params.credential);
	if (!apiKey) return null;
	const { accountId, gatewayId } = resolveCloudflareAiGatewayMetadata(params.credential);
	if (!accountId || !gatewayId) return null;
	const baseUrl = resolveCloudflareAiGatewayBaseUrl({
		accountId,
		gatewayId
	});
	if (!baseUrl) return null;
	return {
		baseUrl,
		api: "anthropic-messages",
		apiKey,
		models: [buildCloudflareAiGatewayModelDefinition()]
	};
}
//#endregion
export { buildCloudflareAiGatewayCatalogProvider as t };
