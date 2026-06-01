import { n as resolveEffectiveHomeDir, r as resolveHomeRelativePath } from "./home-dir-yzjXRaUx.js";
import { n as resolveDefaultConfigPath$1, r as resolveWorkspaceDirInfo } from "./workspace-dir-BFXVbXDc.js";
import fs from "node:fs";
import os from "node:os";
//#region src/utils.ts
async function ensureDir(dir) {
	await fs.promises.mkdir(dir, { recursive: true });
}
/**
* Check if a file or directory exists at the given path.
*/
async function pathExists(targetPath) {
	try {
		await fs.promises.access(targetPath);
		return true;
	} catch {
		return false;
	}
}
function clampNumber(value, min, max) {
	return Math.max(min, Math.min(max, value));
}
function clampInt(value, min, max) {
	return clampNumber(Math.floor(value), min, max);
}
/** Alias for clampNumber (shorter, more common name) */
const clamp = clampNumber;
/**
* Escapes special regex characters in a string so it can be used in a RegExp constructor.
*/
function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/**
* Safely parse JSON, returning null on error instead of throwing.
*/
function safeParseJson(raw) {
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}
/**
* Type guard for Record<string, unknown> (less strict than isPlainObject).
* Accepts any non-null object that isn't an array.
*/
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function normalizeE164(number) {
	const digits = number.replace(/^[a-z][a-z0-9-]*:/i, "").trim().replace(/[^\d+]/g, "");
	if (digits.startsWith("+")) return `+${digits.slice(1)}`;
	return `+${digits}`;
}
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
function isHighSurrogate(codeUnit) {
	return codeUnit >= 55296 && codeUnit <= 56319;
}
function isLowSurrogate(codeUnit) {
	return codeUnit >= 56320 && codeUnit <= 57343;
}
function sliceUtf16Safe(input, start, end) {
	const len = input.length;
	let from = start < 0 ? Math.max(len + start, 0) : Math.min(start, len);
	let to = end === void 0 ? len : end < 0 ? Math.max(len + end, 0) : Math.min(end, len);
	if (to < from) {
		const tmp = from;
		from = to;
		to = tmp;
	}
	if (from > 0 && from < len) {
		if (isLowSurrogate(input.charCodeAt(from)) && isHighSurrogate(input.charCodeAt(from - 1))) from += 1;
	}
	if (to > 0 && to < len) {
		if (isHighSurrogate(input.charCodeAt(to - 1)) && isLowSurrogate(input.charCodeAt(to))) to -= 1;
	}
	return input.slice(from, to);
}
function truncateUtf16Safe(input, maxLen) {
	const limit = Math.max(0, Math.floor(maxLen));
	if (input.length <= limit) return input;
	return sliceUtf16Safe(input, 0, limit);
}
function resolveUserPath(input, env = process.env, homedir = os.homedir) {
	if (!input) return "";
	return resolveHomeRelativePath(input, {
		env,
		homedir
	});
}
/**
* Resolve the user workspace / state directory. The enclawed fork defaults to
* `~/.enclawed/`, with `~/.enclawed/` preserved as a portability fallback for
* existing installs and upstream Enclawed users. See
* `src/infra/workspace-dir.ts` for the full precedence rules.
*/
function resolveConfigDir(env = process.env, homedir = os.homedir) {
	return resolveWorkspaceDirInfo({
		env,
		homedir
	}).path;
}
/**
* Like `resolveConfigDir`, but also reports the rule that fired. Useful for
* diagnostics; consumers that only need the path should keep calling
* `resolveConfigDir`.
*/
function resolveConfigDirInfo(env = process.env, homedir = os.homedir) {
	return resolveWorkspaceDirInfo({
		env,
		homedir
	});
}
/**
* Resolve the default config file path (`enclawed.json` in the new tree,
* `enclawed.json` for legacy installs). Re-exported here so callers that
* already pull from `utils` don't have to learn a second module path.
*/
function resolveDefaultConfigPath(env = process.env, homedir = os.homedir) {
	return resolveDefaultConfigPath$1({
		env,
		homedir
	}).path;
}
function resolveHomeDir() {
	return resolveEffectiveHomeDir(process.env, os.homedir);
}
function resolveHomeDisplayPrefix() {
	const home = resolveHomeDir();
	if (!home) return;
	if (process.env.ENCLAWED_HOME?.trim()) return {
		home,
		prefix: "$ENCLAWED_HOME"
	};
	return {
		home,
		prefix: "~"
	};
}
function shortenHomePath(input) {
	if (!input) return input;
	const display = resolveHomeDisplayPrefix();
	if (!display) return input;
	const { home, prefix } = display;
	if (input === home) return prefix;
	if (input.startsWith(`${home}/`) || input.startsWith(`${home}\\`)) return `${prefix}${input.slice(home.length)}`;
	return input;
}
function shortenHomeInString(input) {
	if (!input) return input;
	const display = resolveHomeDisplayPrefix();
	if (!display) return input;
	return input.split(display.home).join(display.prefix);
}
function displayPath(input) {
	return shortenHomePath(input);
}
function displayString(input) {
	return shortenHomeInString(input);
}
const CONFIG_DIR = resolveConfigDir();
//#endregion
export { truncateUtf16Safe as S, safeParseJson as _, displayPath as a, sleep as b, escapeRegExp as c, pathExists as d, resolveConfigDir as f, resolveUserPath as g, resolveHomeDir as h, clampNumber as i, isRecord as l, resolveDefaultConfigPath as m, clamp as n, displayString as o, resolveConfigDirInfo as p, clampInt as r, ensureDir as s, CONFIG_DIR as t, normalizeE164 as u, shortenHomeInString as v, sliceUtf16Safe as x, shortenHomePath as y };
