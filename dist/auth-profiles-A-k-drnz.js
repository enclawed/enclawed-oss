import "./store-DMcipGx3.js";
import { n as resolveAuthProfileMetadata } from "./identity-TZiybbH7.js";
import "./oauth-B2zEpgV0.js";
import "./profiles-DyPWHaU8.js";
import "./order-CkRYvBja.js";
//#region src/agents/auth-profiles/display.ts
function resolveAuthProfileDisplayLabel(params) {
	const { displayName, email } = resolveAuthProfileMetadata(params);
	if (displayName) return `${params.profileId} (${displayName})`;
	if (email) return `${params.profileId} (${email})`;
	return params.profileId;
}
//#endregion
export { resolveAuthProfileDisplayLabel as t };
