import { n as vi } from "./test.D1JkM1w4-D13rLkG2.js";
//#region src/test-utils/plugin-runtime-env.ts
function createRuntimeEnv(options) {
	const throwOnExit = options?.throwOnExit ?? true;
	return {
		log: vi.fn(),
		error: vi.fn(),
		writeStdout: vi.fn(),
		writeJson: vi.fn(),
		exit: throwOnExit ? vi.fn((code) => {
			throw new Error(`exit ${code}`);
		}) : vi.fn()
	};
}
function createTypedRuntimeEnv(options, _runtimeShape) {
	return createRuntimeEnv(options);
}
function createNonExitingRuntimeEnv() {
	return createRuntimeEnv({ throwOnExit: false });
}
function createNonExitingTypedRuntimeEnv(runtimeShape) {
	return createTypedRuntimeEnv({ throwOnExit: false }, runtimeShape);
}
//#endregion
export { createTypedRuntimeEnv as i, createNonExitingTypedRuntimeEnv as n, createRuntimeEnv as r, createNonExitingRuntimeEnv as t };
