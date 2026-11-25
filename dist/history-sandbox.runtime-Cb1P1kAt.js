import { a as loadConfig } from "./io-CvfgCuUT.js";
import "./config-CU0pEPPr.js";
import { x as readRegistry } from "./docker-10Dv6Z5o.js";
import { n as resolveSandboxContext } from "./context-Xzu93oOY.js";
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
