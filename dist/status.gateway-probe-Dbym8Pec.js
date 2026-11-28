import { t as pickGatewaySelfPresence } from "./gateway-presence-BIaTxWxq.js";
import { t as resolveGatewayProbeTarget } from "./probe-target-Cv_ulxde.js";
import { r as resolveGatewayProbeAuthSafeWithSecretInputs } from "./probe-auth-zA_nO04P.js";
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
