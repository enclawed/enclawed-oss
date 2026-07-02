import { d as readStringValue } from "./string-coerce-BUSzWgUA.js";
import { a as parseFrontmatterBool, c as resolveEnclawedManifestOs, i as parseEnclawedManifestInstallBase, l as resolveEnclawedManifestRequires, n as getFrontmatterString, o as resolveEnclawedManifestBlock, r as normalizeStringList, s as resolveEnclawedManifestInstall, t as applyEnclawedManifestInstallCommonFields, u as parseFrontmatterBlock } from "./frontmatter-d45_wD8h.js";
//#region src/hooks/frontmatter.ts
function parseFrontmatter(content) {
	return parseFrontmatterBlock(content);
}
function parseInstallSpec(input) {
	const parsed = parseEnclawedManifestInstallBase(input, [
		"bundled",
		"npm",
		"git"
	]);
	if (!parsed) return;
	const { raw } = parsed;
	const spec = applyEnclawedManifestInstallCommonFields({ kind: parsed.kind }, parsed);
	if (typeof raw.package === "string") spec.package = raw.package;
	if (typeof raw.repository === "string") spec.repository = raw.repository;
	return spec;
}
function resolveEnclawedMetadata(frontmatter) {
	const metadataObj = resolveEnclawedManifestBlock({ frontmatter });
	if (!metadataObj) return;
	const requires = resolveEnclawedManifestRequires(metadataObj);
	const install = resolveEnclawedManifestInstall(metadataObj, parseInstallSpec);
	const osRaw = resolveEnclawedManifestOs(metadataObj);
	const eventsRaw = normalizeStringList(metadataObj.events);
	return {
		always: typeof metadataObj.always === "boolean" ? metadataObj.always : void 0,
		emoji: readStringValue(metadataObj.emoji),
		homepage: readStringValue(metadataObj.homepage),
		hookKey: readStringValue(metadataObj.hookKey),
		export: readStringValue(metadataObj.export),
		os: osRaw.length > 0 ? osRaw : void 0,
		events: eventsRaw.length > 0 ? eventsRaw : [],
		requires,
		install: install.length > 0 ? install : void 0
	};
}
function resolveHookInvocationPolicy(frontmatter) {
	return { enabled: parseFrontmatterBool(getFrontmatterString(frontmatter, "enabled"), true) };
}
function resolveHookKey(hookName, entry) {
	return entry?.metadata?.hookKey ?? hookName;
}
//#endregion
export { resolveHookKey as i, resolveEnclawedMetadata as n, resolveHookInvocationPolicy as r, parseFrontmatter as t };
