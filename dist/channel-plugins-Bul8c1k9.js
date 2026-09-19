//#region src/test-utils/channel-plugins.ts
const createTestRegistry = (channels = []) => ({
	plugins: [],
	tools: [],
	hooks: [],
	typedHooks: [],
	channels,
	channelSetups: channels.map((entry) => ({
		pluginId: entry.pluginId,
		plugin: entry.plugin,
		source: entry.source,
		enabled: true
	})),
	providers: [],
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
	textTransforms: [],
	agentHarnesses: [],
	gatewayHandlers: {},
	gatewayMethodScopes: {},
	httpRoutes: [],
	cliRegistrars: [],
	reloads: [],
	nodeHostCommands: [],
	securityAuditCollectors: [],
	services: [],
	commands: [],
	codexAppServerExtensionFactories: [],
	agentToolResultMiddlewares: [],
	conversationBindingResolvedHandlers: [],
	diagnostics: []
});
const createChannelTestPluginBase = (params) => ({
	id: params.id,
	meta: {
		id: params.id,
		label: params.label ?? String(params.id),
		selectionLabel: params.label ?? String(params.id),
		docsPath: params.docsPath ?? `/channels/${params.id}`,
		blurb: "test stub.",
		...params.markdownCapable !== void 0 ? { markdownCapable: params.markdownCapable } : {}
	},
	capabilities: params.capabilities ?? { chatTypes: ["direct"] },
	config: {
		listAccountIds: () => ["default"],
		resolveAccount: () => ({}),
		...params.config
	}
});
const createOutboundTestPlugin = (params) => ({
	...createChannelTestPluginBase({
		id: params.id,
		label: params.label,
		docsPath: params.docsPath,
		capabilities: params.capabilities,
		config: { listAccountIds: () => [] }
	}),
	outbound: params.outbound,
	...params.messaging ? { messaging: params.messaging } : {}
});
//#endregion
export { createTestRegistry as n, createOutboundTestPlugin as t };
