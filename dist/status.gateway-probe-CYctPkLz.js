import { t as pickGatewaySelfPresence } from "./gateway-presence-Div7ITly.js";
import { t as resolveGatewayProbeTarget } from "./probe-target-6y0dDYFq.js";
import { r as resolveGatewayProbeAuthSafeWithSecretInputs } from "./probe-auth-vtK0VS6D.js";
//#region src/commands/status.gateway-probe.ts
async function resolveGatewayProbeAuthResolution(cfg) {
	return resolveGatewayProbeAuthSafeWithSecretInputs({
		cfg,
		mode: resolveGatewayProbeTarget(cfg).mode,
		env: process.env
	});
}
async function resolveGatewayProbeAuth(cfg) {
	return (await resolveGatewayProbeAuthResolution(cfg)).auth;
}
//#endregion
export { pickGatewaySelfPresence, resolveGatewayProbeAuth, resolveGatewayProbeAuthResolution };
