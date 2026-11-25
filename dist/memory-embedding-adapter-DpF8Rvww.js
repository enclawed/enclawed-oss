import { s as isMissingEmbeddingApiKeyError } from "./engine-embeddings-A2fV-Z_S.js";
import "./memory-core-host-engine-embeddings-CTZSF7yX.js";
import { n as createMistralEmbeddingProvider, t as DEFAULT_MISTRAL_EMBEDDING_MODEL } from "./embedding-provider-D5ehGKWC.js";
//#region extensions/mistral/memory-embedding-adapter.ts
const mistralMemoryEmbeddingProviderAdapter = {
	id: "mistral",
	defaultModel: DEFAULT_MISTRAL_EMBEDDING_MODEL,
	transport: "remote",
	authProviderId: "mistral",
	autoSelectPriority: 50,
	allowExplicitWhenConfiguredAuto: true,
	shouldContinueAutoSelection: isMissingEmbeddingApiKeyError,
	create: async (options) => {
		const { provider, client } = await createMistralEmbeddingProvider({
			...options,
			provider: "mistral",
			fallback: "none"
		});
		return {
			provider,
			runtime: {
				id: "mistral",
				cacheKeyData: {
					provider: "mistral",
					model: client.model
				}
			}
		};
	}
};
//#endregion
export { mistralMemoryEmbeddingProviderAdapter as t };
