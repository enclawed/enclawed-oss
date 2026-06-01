import "./store-CFRep4YQ.js";
import { n as resolveAuthProfileMetadata } from "./identity-TZiybbH7.js";
import "./oauth-pKeM9C4N.js";
import "./profiles-BxmkyPvG.js";
import "./order-CXBjWUf1.js";
//#region src/agents/auth-profiles/display.ts
function resolveAuthProfileDisplayLabel(params) {
	const { displayName, email } = resolveAuthProfileMetadata(params);
	if (displayName) return `${params.profileId} (${displayName})`;
	if (email) return `${params.profileId} (${email})`;
	return params.profileId;
}
//#endregion
export { resolveAuthProfileDisplayLabel as t };
