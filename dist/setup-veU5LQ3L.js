import "./utils-BcQ7uNrT.js";
import "./links-DrliplKz.js";
import "./types.secrets-5qZ-WD40.js";
import "./setup-helpers-D88L8XQ9.js";
import "./setup-binary-C3teKA1j.js";
import "./setup-wizard-helpers-C8s8VGPh.js";
import "./setup-wizard-proxy-CFYtDFjQ.js";
//#region src/plugin-sdk/resolution-notes.ts
/** Format a short note that separates successfully resolved targets from unresolved passthrough values. */
function formatResolvedUnresolvedNote(params) {
	if (params.resolved.length === 0 && params.unresolved.length === 0) return;
	return [params.resolved.length > 0 ? `Resolved: ${params.resolved.join(", ")}` : void 0, params.unresolved.length > 0 ? `Unresolved (kept as typed): ${params.unresolved.join(", ")}` : void 0].filter(Boolean).join("\n");
}
//#endregion
export { formatResolvedUnresolvedNote as t };
