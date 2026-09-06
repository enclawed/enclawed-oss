import "./store-D3mjjSwW.js";
import { n as resolveAuthProfileMetadata } from "./identity-TZiybbH7.js";
import "./oauth-SFCqfZs4.js";
import "./profiles-Dy1jyl8K.js";
import "./order-C2aADdvY.js";
//#region src/agents/auth-profiles/display.ts
function resolveAuthProfileDisplayLabel(params) {
	const { displayName, email } = resolveAuthProfileMetadata(params);
	if (displayName) return `${params.profileId} (${displayName})`;
	if (email) return `${params.profileId} (${email})`;
	return params.profileId;
}
//#endregion
export { resolveAuthProfileDisplayLabel as t };
