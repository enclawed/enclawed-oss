//#region src/plugins/status.test-helpers.ts
function createPluginRecord(overrides) {
	const { id, ...rest } = overrides;
	return {
		id,
		name: overrides.name ?? id,
		description: overrides.description ?? "",
		source: overrides.source ?? `/tmp/${id}/index.ts`,
		origin: overrides.origin ?? "workspace",
		enabled: overrides.enabled ?? true,
		explicitlyEnabled: overrides.explicitlyEnabled ?? overrides.enabled ?? true,
		activated: overrides.activated ?? overrides.enabled ?? true,
		activationSource: overrides.activationSource ?? (overrides.enabled ?? true ? "explicit" : "disabled"),
		activationReason: overrides.activationReason,
		status: overrides.status ?? "loaded",
		toolNames: [],
		hookNames: [],
		channelIds: [],
		cliBackendIds: [],
		providerIds: [],
		speechProviderIds: [],
		realtimeTranscriptionProviderIds: [],
		realtimeVoiceProviderIds: [],
		mediaUnderstandingProviderIds: [],
		imageGenerationProviderIds: [],
		videoGenerationProviderIds: [],
		musicGenerationProviderIds: [],
		webFetchProviderIds: [],
		webSearchProviderIds: [],
		contextEngineIds: [],
		memoryEmbeddingProviderIds: [],
		agentHarnessIds: [],
		gatewayMethods: [],
		cliCommands: [],
		services: [],
		commands: [],
		httpRoutes: 0,
		hookCount: 0,
		configSchema: false,
		...rest
	};
}
//#endregion
export { createPluginRecord as t };
