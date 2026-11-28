import path from "node:path";
import os from "node:os";
//#region src/enclawed/history-paths.ts
const GLOB_CHARS = /[*?[\]{}]/;
function isAncestorOrSelf(ancestor, target) {
	const rel = path.relative(ancestor, target);
	return rel === "" || !rel.startsWith("..") && !path.isAbsolute(rel);
}
/** The literal directory prefix of an entry, before its first glob segment. */
function staticPrefix(entry) {
	const segments = entry.split("/");
	const literal = [];
	for (const segment of segments) {
		if (GLOB_CHARS.test(segment)) break;
		literal.push(segment);
	}
	const joined = literal.join("/");
	return joined === "" ? "/" : joined;
}
/**
* Validate and normalize one entry. `allowGlob` permits `*` (one segment)
* and `**` (any depth) wildcards; other glob syntax is refused.
*/
function validateOperatorPathEntry(raw, field, opts) {
	const entry = raw.trim();
	if (entry.length === 0) throw new TypeError(`${field}: empty entry`);
	if (!path.posix.isAbsolute(entry) && !path.win32.isAbsolute(entry)) throw new TypeError(`${field}: "${entry}" must be an absolute path`);
	if (/[?[\]{}]/.test(entry)) throw new TypeError(`${field}: "${entry}" may only use * and ** wildcards`);
	if (!opts.allowGlob && entry.includes("*")) throw new TypeError(`${field}: "${entry}" must not contain wildcards`);
	const normalized = path.normalize(entry).replace(/(.)\/+$/, "$1");
	const prefix = path.normalize(staticPrefix(normalized));
	const home = path.resolve(opts.homedir ?? os.homedir());
	if (prefix === path.parse(prefix).root) throw new TypeError(`${field}: "${entry}" covers the filesystem root`);
	if (isAncestorOrSelf(prefix, home)) throw new TypeError(`${field}: "${entry}" covers a whole home directory`);
	return normalized;
}
function globToRegExp(glob) {
	let out = "^";
	for (let i = 0; i < glob.length; i++) {
		const c = glob[i];
		if (c === "*") if (glob[i + 1] === "*") {
			out += ".*";
			i++;
		} else out += "[^/]*";
		else out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	}
	return new RegExp(`${out}$`);
}
/**
* True when `target` (absolute, normalized) is an entry or lies under one.
* A plain entry matches itself and everything below it; a glob matches the
* path itself or any of its ancestors, so `/data/**` and `/data/*.bin`
* behave as expected.
*/
function pathMatchesEntry(target, entry) {
	if (!entry.includes("*")) return isAncestorOrSelf(entry, target);
	const re = globToRegExp(entry);
	for (let p = target;; p = path.dirname(p)) {
		if (re.test(p)) return true;
		if (path.dirname(p) === p) return false;
	}
}
function isInsideDir(dir, target) {
	return isAncestorOrSelf(dir, target);
}
//#endregion
export { pathMatchesEntry as n, validateOperatorPathEntry as r, isInsideDir as t };
