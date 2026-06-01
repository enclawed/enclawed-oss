import { s as isMissingEmbeddingApiKeyError } from "./engine-embeddings-KAJuZJuS.js";
import "./memory-core-host-engine-embeddings-C_nu5UC7.js";
import { c as DEFAULT_DEEPINFRA_EMBEDDING_MODEL } from "./media-models-CI1_neYD.js";
import { t as createDeepInfraEmbeddingProvider } from "./embedding-provider-B609qSZx.js";
//#region extensions/deepinfra/memory-embedding-adapter.ts
const deepinfraMemoryEmbeddingProviderAdapter = {
	id: "deepinfra",
	defaultModel: DEFAULT_DEEPINFRA_EMBEDDING_MODEL,
	transport: "remote",
	authProviderId: "deepinfra",
	autoSelectPriority: 55,
	allowExplicitWhenConfiguredAuto: true,
	shouldContinueAutoSelection: isMissingEmbeddingApiKeyError,
	create: async (options) => {
		const { provider, client } = await createDeepInfraEmbeddingProvider({
			...options,
			provider: "deepinfra",
			fallback: "none"
		});
		return {
			provider,
			runtime: {
				id: "deepinfra",
				cacheKeyData: {
					provider: "deepinfra",
					model: client.model
				}
			}
		};
	}
};
//#endregion
export { deepinfraMemoryEmbeddingProviderAdapter as t };
