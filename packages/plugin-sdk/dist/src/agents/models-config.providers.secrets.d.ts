import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { AuthProfileStore } from "./auth-profiles/types.js";
import { type ProviderApiKeyResolver, type ProviderAuthResolver } from "./models-config.providers.secret-helpers.js";
export type { ProfileApiKeyResolution, ProviderApiKeyResolver, ProviderAuthResolver, ProviderConfig, SecretDefaults, } from "./models-config.providers.secret-helpers.js";
export { listAuthProfilesForProvider, normalizeApiKeyConfig, normalizeConfiguredProviderApiKey, normalizeHeaderValues, normalizeResolvedEnvApiKey, resolveApiKeyFromCredential, resolveApiKeyFromProfiles, resolveAwsSdkApiKeyVarName, resolveEnvApiKeyVarName, resolveMissingProviderApiKey, toDiscoveryApiKey, } from "./models-config.providers.secret-helpers.js";
type AuthProfileStoreInput = AuthProfileStore | (() => AuthProfileStore);
export declare function createProviderApiKeyResolver(env: NodeJS.ProcessEnv, authStoreInput: AuthProfileStoreInput, config?: EnclawedConfig): ProviderApiKeyResolver;
export declare function createProviderAuthResolver(env: NodeJS.ProcessEnv, authStoreInput: AuthProfileStoreInput, config?: EnclawedConfig): ProviderAuthResolver;
