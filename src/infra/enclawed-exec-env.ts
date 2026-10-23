export const ENCLAWED_CLI_ENV_VAR = "ENCLAWED_CLI";
export const ENCLAWED_CLI_ENV_VALUE = "1";

export function markEnclawedExecEnv<T extends Record<string, string | undefined>>(env: T): T {
  return {
    ...env,
    [ENCLAWED_CLI_ENV_VAR]: ENCLAWED_CLI_ENV_VALUE,
  };
}

export function ensureEnclawedExecMarkerOnProcess(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  env[ENCLAWED_CLI_ENV_VAR] = ENCLAWED_CLI_ENV_VALUE;
  return env;
}
