import "./store-DxE5HEh1.js";
import { n as resolveAuthProfileMetadata } from "./identity-TZiybbH7.js";
import "./oauth-CaK2Slhi.js";
import "./profiles-BHvv2Pe4.js";
import "./order-CI8OVemT.js";
//#region src/agents/auth-profiles/display.ts
function resolveAuthProfileDisplayLabel(params) {
	const { displayName, email } = resolveAuthProfileMetadata(params);
	if (displayName) return `${params.profileId} (${displayName})`;
	if (email) return `${params.profileId} (${email})`;
	return params.profileId;
}
//#endregion
export { resolveAuthProfileDisplayLabel as t };
