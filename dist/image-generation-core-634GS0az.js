import "./subsystem-WGqvYWrS.js";
import "./provider-env-vars-reCe_d7o.js";
import "./failover-error-B4l-iODK.js";
import "./provider-registry-CyI0b3H3.js";
import "./runtime-shared-_EalG-4C.js";
import "./provider-model-shared-CbMZtQ7U.js";
import "./provider-model-defaults-B1lpxLtp.js";
//#region src/plugin-sdk/image-generation-core.ts
let imageGenerationCoreAuthRuntimePromise;
async function loadImageGenerationCoreAuthRuntime() {
	imageGenerationCoreAuthRuntimePromise ??= import("./image-generation-core.auth.runtime-BLwyZy3m.js");
	return imageGenerationCoreAuthRuntimePromise;
}
async function resolveApiKeyForProvider(...args) {
	return (await loadImageGenerationCoreAuthRuntime()).resolveApiKeyForProvider(...args);
}
//#endregion
export { resolveApiKeyForProvider as t };
