import { t as resolveMemoryBackendConfig } from "./backend-config-Bj8GsWqb.js";
import "./memory-core-host-runtime-files-Mt2lTZih.js";
import { n as getMemorySearchManager, t as closeAllMemorySearchManagers } from "./memory-C1VEnhcE.js";
//#region extensions/memory-core/src/runtime-provider.ts
const memoryRuntime = {
	async getMemorySearchManager(params) {
		const { manager, error } = await getMemorySearchManager(params);
		return {
			manager,
			error
		};
	},
	resolveMemoryBackendConfig(params) {
		return resolveMemoryBackendConfig(params);
	},
	async closeAllMemorySearchManagers() {
		await closeAllMemorySearchManagers();
	}
};
//#endregion
export { memoryRuntime as t };
