import "./redact-D4nea1HF.js";
import "./errors-D8p6rxH8.js";
import "./shared-B4dUOT5B.js";
import "./ports-BX5qBkwz.js";
import "./ssrf-CeUgojmR.js";
import "./fs-safe-HEHEfaEP.js";
import "./runtime-shared-De0E2W2f.js";
import { i as wrapExternalContent } from "./external-content-D1wu_onJ.js";
import "./dm-policy-shared-B5VD9XJg.js";
import "./channel-secret-collector-runtime-mbs5nqUq.js";
import "./browser-security-runtime-CbLF2sYt.js";
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
