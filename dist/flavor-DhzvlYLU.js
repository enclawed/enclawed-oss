//#region src/enclawed/flavor.ts
const SECURE_ALIASES = new Set([
	"enclaved",
	"secure",
	"classified",
	"high-side"
]);
const OPEN_ALIASES = new Set([
	"open",
	"enclawed-compat",
	"permissive",
	"default"
]);
function parseFlavor(raw) {
	if (typeof raw !== "string") return null;
	const v = raw.trim().toLowerCase();
	if (SECURE_ALIASES.has(v)) return "enclaved";
	if (OPEN_ALIASES.has(v)) return "open";
	return null;
}
function getFlavor(env = process.env) {
	const explicit = parseFlavor(env.ENCLAWED_FLAVOR);
	if (explicit) return explicit;
	return "open";
}
//#endregion
export { getFlavor as t };
