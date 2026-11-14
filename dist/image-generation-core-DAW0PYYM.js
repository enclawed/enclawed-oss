import "./subsystem-WGqvYWrS.js";
import "./provider-env-vars-Cj3jFmNA.js";
import "./failover-error-B3QVYP5o.js";
import "./provider-registry-1gyi0Y8L.js";
import "./runtime-shared-C5j3g9aB.js";
import "./provider-model-shared-DriLpfUN.js";
import "./provider-model-defaults-Ve-3UDR_.js";
//#region src/plugin-sdk/image-generation-core.ts
let imageGenerationCoreAuthRuntimePromise;
async function loadImageGenerationCoreAuthRuntime() {
	imageGenerationCoreAuthRuntimePromise ??= import("./image-generation-core.auth.runtime-DfvKDV4m.js");
	return imageGenerationCoreAuthRuntimePromise;
}
async function resolveApiKeyForProvider(...args) {
	return (await loadImageGenerationCoreAuthRuntime()).resolveApiKeyForProvider(...args);
}
//#endregion
export { resolveApiKeyForProvider as t };
