import { ModelRegistry as PiModelRegistry, ModelRuntime } from "@mariozechner/pi-coding-agent";
import { type PiCredentialMap } from "./pi-auth-credentials.js";
import { EnclawedPiCredentialStore } from "./pi-credential-store.js";
export { EnclawedPiCredentialStore as AuthStorage, PiModelRegistry as ModelRegistry, ModelRuntime };
export declare function normalizeDiscoveredPiModel<T>(value: T, agentDir: string): T;
export declare function scrubLegacyStaticAuthJsonEntriesForDiscovery(pathname: string): void;
export declare function addEnvBackedPiCredentials(credentials: PiCredentialMap, env?: NodeJS.ProcessEnv): PiCredentialMap;
export declare function resolvePiCredentialsForDiscovery(agentDir: string): PiCredentialMap;
/**
 * Enclawed's credential store for pi, seeded with the credentials Enclawed
 * resolved for discovery (auth profiles, accepted env keys, synthetic plugin
 * auth). pi never opens its own auth.json.
 */
export declare function discoverAuthStorage(agentDir: string): EnclawedPiCredentialStore;
/**
 * pi model runtime bound to Enclawed's sources only:
 * - credentials: Enclawed's in-memory store (never `~/.pi/agent/auth.json`);
 * - models: Enclawed's generated `<agentDir>/models.json` (never `~/.pi`);
 * - catalog cache: in memory (no `models-store.json` written next to it);
 * - no network catalog refresh (`allowModelNetwork` stays off).
 */
export declare function discoverModelRuntime(authStorage: EnclawedPiCredentialStore, agentDir: string): Promise<ModelRuntime>;
/** Enclawed-policy view over a pi model runtime (normalized models, denied providers removed). */
export declare function createModelRegistryForRuntime(modelRuntime: ModelRuntime, agentDir: string): PiModelRegistry;
export declare function discoverModels(authStorage: EnclawedPiCredentialStore, agentDir: string): Promise<PiModelRegistry>;
