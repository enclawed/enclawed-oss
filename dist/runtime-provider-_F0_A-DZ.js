import { t as resolveMemoryBackendConfig } from "./backend-config-B8loykXX.js";
import "./memory-core-host-runtime-files-GJW0w47C.js";
import { n as getMemorySearchManager, t as closeAllMemorySearchManagers } from "./memory-C7XFi7GK.js";
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
