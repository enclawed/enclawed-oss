import { a as loadConfig } from "./io-B2MO_b-F.js";
import "./config-BDqdmU33.js";
import { x as readRegistry } from "./docker-Bylp9sl6.js";
import { n as resolveSandboxContext } from "./context-0vg3qOgJ.js";
//#region src/cli/history-sandbox.runtime.ts
const openSnapshotSandbox = async (origin) => {
	if (!(await readRegistry()).entries.some((e) => e.containerName === origin.runtimeId)) return null;
	const context = await resolveSandboxContext({
		config: loadConfig(),
		sessionKey: origin.sessionKey
	});
	if (!context?.fsBridge || context.runtimeId !== origin.runtimeId) return null;
	return context.fsBridge;
};
//#endregion
export { openSnapshotSandbox };
