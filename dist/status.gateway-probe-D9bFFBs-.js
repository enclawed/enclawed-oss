import { t as pickGatewaySelfPresence } from "./gateway-presence-DRhdrxSc.js";
import { t as resolveGatewayProbeTarget } from "./probe-target-DcJeTaIn.js";
import { r as resolveGatewayProbeAuthSafeWithSecretInputs } from "./probe-auth-Dg1mIEQc.js";
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
