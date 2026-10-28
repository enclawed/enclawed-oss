import "./utils-BcQ7uNrT.js";
import "./types.secrets-C7GHgMrh.js";
import "./setup-helpers-Dsxp4-4J.js";
import "./setup-binary-f7c7iMqU.js";
import "./setup-wizard-helpers-A7VVNxLn.js";
import "./setup-wizard-proxy-sfkHhm_G.js";
//#region src/plugin-sdk/resolution-notes.ts
/** Format a short note that separates successfully resolved targets from unresolved passthrough values. */
function formatResolvedUnresolvedNote(params) {
	if (params.resolved.length === 0 && params.unresolved.length === 0) return;
	return [params.resolved.length > 0 ? `Resolved: ${params.resolved.join(", ")}` : void 0, params.unresolved.length > 0 ? `Unresolved (kept as typed): ${params.unresolved.join(", ")}` : void 0].filter(Boolean).join("\n");
}
//#endregion
export { formatResolvedUnresolvedNote as t };
