import "./store-J7Io5AUg.js";
import { n as resolveAuthProfileMetadata } from "./identity-Br4xNxA9.js";
import "./oauth-BXnnL9He.js";
import "./profiles-FX5Xo3iA.js";
import "./order-B81rwr6N.js";
//#region src/agents/auth-profiles/display.ts
function resolveAuthProfileDisplayLabel(params) {
	const { displayName, email } = resolveAuthProfileMetadata(params);
	if (displayName) return `${params.profileId} (${displayName})`;
	if (email) return `${params.profileId} (${email})`;
	return params.profileId;
}
//#endregion
export { resolveAuthProfileDisplayLabel as t };
