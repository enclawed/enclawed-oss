import "./utils-CrVQlOZJ.js";
import "./types.secrets-BpVPfGSB.js";
import "./setup-helpers-DOTBbn4V.js";
import "./setup-binary-CLtgSfbE.js";
import "./setup-wizard-helpers-DDpEhh55.js";
import "./setup-wizard-proxy-C9oibAtI.js";
//#region src/plugin-sdk/resolution-notes.ts
/** Format a short note that separates successfully resolved targets from unresolved passthrough values. */
function formatResolvedUnresolvedNote(params) {
	if (params.resolved.length === 0 && params.unresolved.length === 0) return;
	return [params.resolved.length > 0 ? `Resolved: ${params.resolved.join(", ")}` : void 0, params.unresolved.length > 0 ? `Unresolved (kept as typed): ${params.unresolved.join(", ")}` : void 0].filter(Boolean).join("\n");
}
//#endregion
export { formatResolvedUnresolvedNote as t };
