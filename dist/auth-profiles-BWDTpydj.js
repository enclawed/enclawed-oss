import "./store-BE5joT0l.js";
import { n as resolveAuthProfileMetadata } from "./identity-DTbxyBUK.js";
import "./oauth-IweHToHn.js";
import "./profiles-bmZVwHcQ.js";
import "./order-DD_IoENA.js";
//#region src/agents/auth-profiles/display.ts
function resolveAuthProfileDisplayLabel(params) {
	const { displayName, email } = resolveAuthProfileMetadata(params);
	if (displayName) return `${params.profileId} (${displayName})`;
	if (email) return `${params.profileId} (${email})`;
	return params.profileId;
}
//#endregion
export { resolveAuthProfileDisplayLabel as t };
