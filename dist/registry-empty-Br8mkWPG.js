//#region src/plugins/registry-empty.ts
function createEmptyPluginRegistry() {
	return {
		plugins: [],
		tools: [],
		hooks: [],
		typedHooks: [],
		channels: [],
		channelSetups: [],
		providers: [],
		cliBackends: [],
		textTransforms: [],
		speechProviders: [],
		realtimeTranscriptionProviders: [],
		realtimeVoiceProviders: [],
		mediaUnderstandingProviders: [],
		imageGenerationProviders: [],
		videoGenerationProviders: [],
		musicGenerationProviders: [],
		webFetchProviders: [],
		webSearchProviders: [],
		memoryEmbeddingProviders: [],
		agentHarnesses: [],
		gatewayHandlers: {},
		gatewayMethodScopes: {},
		httpRoutes: [],
		cliRegistrars: [],
		reloads: [],
		nodeHostCommands: [],
		securityAuditCollectors: [],
		services: [],
		gatewayDiscoveryServices: [],
		migrationProviders: [],
		nodeInvokePolicies: [],
		commands: [],
		conversationBindingResolvedHandlers: [],
		diagnostics: [],
		agentToolResultMiddlewares: [],
		codexAppServerExtensionFactories: []
	};
}
//#endregion
export { createEmptyPluginRegistry as t };
