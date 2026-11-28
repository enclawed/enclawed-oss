import { i as assertSecondFactor } from "./gate-DSRB75ux.js";
import { n as gatedPurposeForCommand } from "./command-table-fXw1z64A.js";
//#region src/enclawed/auth/device-factor.ts
async function resolveDeviceSecondFactor() {
	return null;
}
//#endregion
//#region src/enclawed/auth/command-gate.ts
/**
* Enforce the second factor for a CLI command. Resolves with null for an
* ungated command, or with the proof; throws SecondFactorError when refused.
*/
async function enforceCommandSecondFactor(commandPath, argv, ctx = {}) {
	const purpose = gatedPurposeForCommand(commandPath, argv);
	if (!purpose) return null;
	const deviceFactor = ctx.deviceFactor !== void 0 ? ctx.deviceFactor : await resolveDeviceSecondFactor();
	return assertSecondFactor({
		...ctx,
		deviceFactor
	}, {
		purpose,
		detail: commandPath.join(" ")
	});
}
//#endregion
export { resolveDeviceSecondFactor as n, enforceCommandSecondFactor as t };
