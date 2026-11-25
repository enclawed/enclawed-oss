import "./subsystem-BCgIuXto.js";
import "./provider-env-vars-MqWRArIf.js";
import "./failover-error-C3N4Z1bZ.js";
import "./provider-registry-D6CsXSo5.js";
import "./runtime-shared-DfKSK-_1.js";
import "./provider-model-shared-Chi1KYWw.js";
import "./provider-model-defaults-D-_wVT2o.js";
//#region src/plugin-sdk/image-generation-core.ts
let imageGenerationCoreAuthRuntimePromise;
async function loadImageGenerationCoreAuthRuntime() {
	imageGenerationCoreAuthRuntimePromise ??= import("./image-generation-core.auth.runtime-DEWU7o7H.js");
	return imageGenerationCoreAuthRuntimePromise;
}
async function resolveApiKeyForProvider(...args) {
	return (await loadImageGenerationCoreAuthRuntime()).resolveApiKeyForProvider(...args);
}
//#endregion
export { resolveApiKeyForProvider as t };
