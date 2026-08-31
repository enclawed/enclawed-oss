import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { SecretDefaults } from "./models-config.providers.secrets.js";
type ModelsConfig = NonNullable<EnclawedConfig["models"]>;
export declare function enforceSourceManagedProviderSecrets(params: {
    providers: ModelsConfig["providers"];
    sourceProviders: ModelsConfig["providers"] | undefined;
    sourceSecretDefaults?: SecretDefaults;
    secretRefManagedProviders?: Set<string>;
}): ModelsConfig["providers"];
export {};
