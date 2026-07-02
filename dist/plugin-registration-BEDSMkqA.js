import { n as createCapturedPluginRegistration } from "./captured-registration-BtbEPiAJ.js";
//#region src/test-utils/plugin-registration.ts
async function registerSingleProviderPlugin(params) {
	const captured = createCapturedPluginRegistration();
	params.register(captured.api);
	const provider = captured.providers[0];
	if (!provider) throw new Error("provider registration missing");
	return provider;
}
async function registerProviderPlugins(...plugins) {
	const captured = createCapturedPluginRegistration();
	for (const plugin of plugins) plugin.register(captured.api);
	return captured.providers;
}
function requireRegisteredProvider(providers, providerId, label = "provider") {
	const provider = providers.find((entry) => entry.id === providerId);
	if (!provider) throw new Error(`${label} ${providerId} missing`);
	return provider;
}
async function registerProviderPlugin(params) {
	const captured = createCapturedPluginRegistration({
		id: params.id,
		name: params.name,
		source: params.id
	});
	params.plugin.register(captured.api);
	return {
		providers: captured.providers,
		realtimeTranscriptionProviders: captured.realtimeTranscriptionProviders,
		speechProviders: captured.speechProviders,
		mediaProviders: captured.mediaUnderstandingProviders,
		imageProviders: captured.imageGenerationProviders,
		musicProviders: captured.musicGenerationProviders,
		videoProviders: captured.videoGenerationProviders
	};
}
//#endregion
export { requireRegisteredProvider as i, registerProviderPlugins as n, registerSingleProviderPlugin as r, registerProviderPlugin as t };
