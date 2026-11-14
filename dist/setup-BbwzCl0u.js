import "./utils-BcQ7uNrT.js";
import "./types.secrets-BXXJR1J4.js";
import "./setup-helpers-C5E34pUz.js";
import "./setup-binary-CsmAiuCh.js";
import "./setup-wizard-helpers-CkKTIZxY.js";
import "./setup-wizard-proxy-p9KdCf8y.js";
//#region src/plugin-sdk/resolution-notes.ts
/** Format a short note that separates successfully resolved targets from unresolved passthrough values. */
function formatResolvedUnresolvedNote(params) {
	if (params.resolved.length === 0 && params.unresolved.length === 0) return;
	return [params.resolved.length > 0 ? `Resolved: ${params.resolved.join(", ")}` : void 0, params.unresolved.length > 0 ? `Unresolved (kept as typed): ${params.unresolved.join(", ")}` : void 0].filter(Boolean).join("\n");
}
//#endregion
export { formatResolvedUnresolvedNote as t };
