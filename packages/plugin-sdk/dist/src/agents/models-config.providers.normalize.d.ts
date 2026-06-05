import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { SecretDefaults } from "./models-config.providers.secret-helpers.js";
type ModelsConfig = NonNullable<EnclawedConfig["models"]>;
export declare function normalizeProviders(params: {
    providers: ModelsConfig["providers"];
    agentDir: string;
    env?: NodeJS.ProcessEnv;
    secretDefaults?: SecretDefaults;
    sourceProviders?: ModelsConfig["providers"];
    sourceSecretDefaults?: SecretDefaults;
    secretRefManagedProviders?: Set<string>;
}): ModelsConfig["providers"];
export {};
