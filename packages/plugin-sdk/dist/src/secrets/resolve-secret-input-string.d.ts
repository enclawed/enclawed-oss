import type { EnclawedConfig } from "../config/types.enclawed.js";
import { type SecretRef } from "../config/types.secrets.js";
type SecretDefaults = NonNullable<EnclawedConfig["secrets"]>["defaults"];
export declare function resolveSecretInputString(params: {
    config: EnclawedConfig;
    value: unknown;
    env: NodeJS.ProcessEnv;
    defaults?: SecretDefaults;
    normalize?: (value: unknown) => string | undefined;
    onResolveRefError?: (error: unknown, ref: SecretRef) => never;
}): Promise<string | undefined>;
export {};
