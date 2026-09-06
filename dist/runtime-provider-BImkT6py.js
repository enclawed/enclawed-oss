import { t as resolveMemoryBackendConfig } from "./backend-config-DkAv28sk.js";
import "./memory-core-host-runtime-files-DGQ67fhM.js";
import { n as getMemorySearchManager, t as closeAllMemorySearchManagers } from "./memory-Fz7dgqnQ.js";
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
