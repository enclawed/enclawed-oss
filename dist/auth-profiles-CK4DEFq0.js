import "./store-B42uPB2x.js";
import { n as resolveAuthProfileMetadata } from "./identity-L4noZ4-u.js";
import "./oauth-DA49PztB.js";
import "./profiles-cHFeSJKx.js";
import "./order-BxwQYG8M.js";
//#region src/agents/auth-profiles/display.ts
function resolveAuthProfileDisplayLabel(params) {
	const { displayName, email } = resolveAuthProfileMetadata(params);
	if (displayName) return `${params.profileId} (${displayName})`;
	if (email) return `${params.profileId} (${email})`;
	return params.profileId;
}
//#endregion
export { resolveAuthProfileDisplayLabel as t };
