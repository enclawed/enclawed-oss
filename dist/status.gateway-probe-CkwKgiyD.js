import { t as pickGatewaySelfPresence } from "./gateway-presence-BPLAH0Dc.js";
import { t as resolveGatewayProbeTarget } from "./probe-target-BRB4ULEk.js";
import { r as resolveGatewayProbeAuthSafeWithSecretInputs } from "./probe-auth-DBXIQLwi.js";
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
