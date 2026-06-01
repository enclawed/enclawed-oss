import "./redact-D4nea1HF.js";
import "./errors-D8p6rxH8.js";
import "./shared-B-Pgjspa.js";
import "./ports-DZ1rIgxx.js";
import "./ssrf-DQDx1s1G.js";
import "./fs-safe-B5oXcRDC.js";
import "./runtime-shared-Db4frzlP.js";
import { i as wrapExternalContent } from "./external-content-BG0h4WfB.js";
import "./dm-policy-shared-DioTCxGL.js";
import "./channel-secret-collector-runtime-B9yZCYSL.js";
import "./browser-security-runtime-BJ3wVzDK.js";
//#region src/security/channel-metadata.ts
const DEFAULT_MAX_CHARS = 800;
const DEFAULT_MAX_ENTRY_CHARS = 400;
function normalizeEntry(entry) {
	return entry.replace(/\s+/g, " ").trim();
}
function truncateText(value, maxChars) {
	if (maxChars <= 0) return "";
	if (value.length <= maxChars) return value;
	return `${value.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}
function buildUntrustedChannelMetadata(params) {
	const deduped = params.entries.map((entry) => typeof entry === "string" ? normalizeEntry(entry) : "").filter((entry) => Boolean(entry)).map((entry) => truncateText(entry, DEFAULT_MAX_ENTRY_CHARS)).filter((entry, index, list) => list.indexOf(entry) === index);
	if (deduped.length === 0) return;
	const body = deduped.join("\n");
	return wrapExternalContent(truncateText(`${`UNTRUSTED channel metadata (${params.source})`}\n${`${params.label}:\n${body}`}`, params.maxChars ?? DEFAULT_MAX_CHARS), {
		source: "channel_metadata",
		includeWarning: false
	});
}
//#endregion
export { buildUntrustedChannelMetadata as t };
