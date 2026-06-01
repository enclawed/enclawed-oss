import { t as buildGatewayConnectionDetailsWithResolvers } from "./connection-details-skKbFek7.js";
import { t as resolveGatewayConnectionAuth } from "./connection-auth-DEbgosBF.js";
//#region src/gateway/client-bootstrap.ts
function resolveGatewayUrlOverrideSource(urlSource) {
	if (urlSource === "cli --url") return "cli";
	if (urlSource === "env ENCLAWED_GATEWAY_URL") return "env";
}
async function resolveGatewayClientBootstrap(params) {
	const connection = buildGatewayConnectionDetailsWithResolvers({
		config: params.config,
		url: params.gatewayUrl
	});
	const urlOverrideSource = resolveGatewayUrlOverrideSource(connection.urlSource);
	const auth = await resolveGatewayConnectionAuth({
		config: params.config,
		explicitAuth: params.explicitAuth,
		env: params.env ?? process.env,
		urlOverride: urlOverrideSource ? connection.url : void 0,
		urlOverrideSource
	});
	return {
		url: connection.url,
		urlSource: connection.urlSource,
		auth
	};
}
//#endregion
export { resolveGatewayClientBootstrap as t };
