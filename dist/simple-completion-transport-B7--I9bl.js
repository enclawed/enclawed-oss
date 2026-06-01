import { a as prepareTransportAwareSimpleModel, n as ensureCustomApiRegistered, r as buildTransportAwareSimpleStreamFn, t as registerProviderStreamForModel } from "./provider-stream-C7D5XxFN.js";
import { t as createAnthropicVertexStreamFnForModel } from "./anthropic-vertex-stream-BF7d1SXr.js";
import { getApiProvider } from "@mariozechner/pi-ai";
//#region src/agents/simple-completion-transport.ts
function resolveAnthropicVertexSimpleApi(baseUrl) {
	return `enclawed-anthropic-vertex-simple:${baseUrl?.trim() ? encodeURIComponent(baseUrl.trim()) : "default"}`;
}
function prepareModelForSimpleCompletion(params) {
	const { model, cfg } = params;
	if (!getApiProvider(model.api) && registerProviderStreamForModel({
		model,
		cfg
	})) return model;
	const transportAwareModel = prepareTransportAwareSimpleModel(model);
	if (transportAwareModel !== model) {
		const streamFn = buildTransportAwareSimpleStreamFn(model);
		if (streamFn) {
			ensureCustomApiRegistered(transportAwareModel.api, streamFn);
			return transportAwareModel;
		}
	}
	if (model.provider === "anthropic-vertex") {
		const api = resolveAnthropicVertexSimpleApi(model.baseUrl);
		ensureCustomApiRegistered(api, createAnthropicVertexStreamFnForModel(model));
		return {
			...model,
			api
		};
	}
	return model;
}
//#endregion
export { prepareModelForSimpleCompletion as t };
