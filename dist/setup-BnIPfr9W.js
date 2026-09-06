import "./utils-BcQ7uNrT.js";
import "./types.secrets-B-g1z55T.js";
import "./setup-helpers-4QaeDWq0.js";
import "./setup-binary-Btqy8FVd.js";
import "./setup-wizard-helpers-DSNPYAi8.js";
import "./setup-wizard-proxy-DiHVIzHY.js";
//#region src/plugin-sdk/resolution-notes.ts
/** Format a short note that separates successfully resolved targets from unresolved passthrough values. */
function formatResolvedUnresolvedNote(params) {
	if (params.resolved.length === 0 && params.unresolved.length === 0) return;
	return [params.resolved.length > 0 ? `Resolved: ${params.resolved.join(", ")}` : void 0, params.unresolved.length > 0 ? `Unresolved (kept as typed): ${params.unresolved.join(", ")}` : void 0].filter(Boolean).join("\n");
}
//#endregion
export { formatResolvedUnresolvedNote as t };
