import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
//#region src/enclawed/integration/module-binding.ts
const MANIFEST_FILES = ["enclawed.module.json", "enclawed.plugin.json"];
function readOrEmpty(path) {
	try {
		return readFileSync(path);
	} catch (err) {
		if (err.code === "ENOENT") return Buffer.alloc(0);
		throw err;
	}
}
/** Compute the binding for a module directory. Throws when the directory cannot be resolved. */
function computeModuleBinding(moduleDir) {
	const rootReal = realpathSync(moduleDir);
	const h = createHash("sha256");
	for (const name of MANIFEST_FILES) {
		const bytes = readOrEmpty(join(rootReal, name));
		h.update(`${name}\0${bytes.length}\0`);
		h.update(bytes);
	}
	return Object.freeze({
		rootReal,
		manifestSha256: h.digest("hex")
	});
}
const BINDINGS_KEY = Symbol.for("enclawed.module-bindings");
function setModuleBindings(bindings) {
	globalThis[BINDINGS_KEY] = bindings;
}
function getModuleBinding(id) {
	return globalThis[BINDINGS_KEY]?.get(id);
}
/** Compare a candidate directory against the binding recorded for its id. */
function checkModuleBinding(expected, candidateDir) {
	let actual;
	try {
		actual = computeModuleBinding(candidateDir);
	} catch (err) {
		return {
			ok: false,
			reason: `cannot resolve ${candidateDir}: ${err.message}`,
			expected,
			actual: null
		};
	}
	if (actual.rootReal !== expected.rootReal) return {
		ok: false,
		reason: `loaded from ${actual.rootReal}, but the verified plugin with this id is at ${expected.rootReal}`,
		expected,
		actual
	};
	if (actual.manifestSha256 !== expected.manifestSha256) return {
		ok: false,
		reason: `its manifests changed since they were verified at boot`,
		expected,
		actual
	};
	return { ok: true };
}
//#endregion
export { setModuleBindings as i, computeModuleBinding as n, getModuleBinding as r, checkModuleBinding as t };
