import "./store-BEvLnewG.js";
import { n as resolveAuthProfileMetadata } from "./identity-Bb7hhAc2.js";
import "./oauth-CORBQbOF.js";
import "./profiles-FqvT5frh.js";
import "./order-BruapFQ0.js";
//#region src/agents/auth-profiles/display.ts
function resolveAuthProfileDisplayLabel(params) {
	const { displayName, email } = resolveAuthProfileMetadata(params);
	if (displayName) return `${params.profileId} (${displayName})`;
	if (email) return `${params.profileId} (${email})`;
	return params.profileId;
}
//#endregion
export { resolveAuthProfileDisplayLabel as t };
