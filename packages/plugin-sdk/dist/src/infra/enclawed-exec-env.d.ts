export declare const ENCLAWED_CLI_ENV_VAR = "ENCLAWED_CLI";
export declare const ENCLAWED_CLI_ENV_VALUE = "1";
export declare function markEnclawedExecEnv<T extends Record<string, string | undefined>>(env: T): T;
export declare function ensureEnclawedExecMarkerOnProcess(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
