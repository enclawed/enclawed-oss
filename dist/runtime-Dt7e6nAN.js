//#region src/enclawed/runtime.ts
const RUNTIME_KEY = Symbol.for("enclawed.runtime");
function getRuntime() {
	return globalThis[RUNTIME_KEY] ?? null;
}
function setRuntime(runtime) {
	globalThis[RUNTIME_KEY] = runtime;
}
function clearRuntime() {
	delete globalThis[RUNTIME_KEY];
}
//#endregion
export { getRuntime as n, setRuntime as r, clearRuntime as t };
