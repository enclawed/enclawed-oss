//#region src/infra/enclawed-exec-env.ts
const ENCLAWED_CLI_ENV_VAR = "ENCLAWED_CLI";
function markEnclawedExecEnv(env) {
	return {
		...env,
		[ENCLAWED_CLI_ENV_VAR]: "1"
	};
}
function ensureEnclawedExecMarkerOnProcess(env = process.env) {
	env[ENCLAWED_CLI_ENV_VAR] = "1";
	return env;
}
//#endregion
export { markEnclawedExecEnv as n, ensureEnclawedExecMarkerOnProcess as t };
