import type { AuthOperationOptions, Credential, CredentialInfo, CredentialStore } from "@mariozechner/pi-ai";
import type { PiCredentialMap } from "./pi-auth-credentials.types.js";
/**
 * The only credential source Enclawed gives pi.
 *
 * pi-coding-agent >= 0.80.8 resolves request auth through a pi-ai
 * `CredentialStore` (`ModelRuntime.create({ credentials })`). When none is
 * given it opens its own file store (`~/.pi/agent/auth.json`, or
 * `<agentDir>/auth.json`) and may write OAuth refreshes there. Enclawed is the
 * credential authority (auth profiles, SecretRefs, env policy, provider
 * denylist), so every pi model runtime Enclawed creates gets this in-memory
 * store seeded with exactly the credentials Enclawed resolved; nothing is read
 * from or written to disk.
 *
 * pi-ai consults ambient sources (environment variables, AWS profiles, ADC
 * files) only for a provider that has no stored credential, so Enclawed also
 * seeds env-backed keys it accepts (see `addEnvBackedPiCredentials`), and the
 * embedded runner always passes the run's resolved key explicitly.
 *
 * OAuth refreshes pi performs (`modify`) stay in memory for the lifetime of
 * the store; Enclawed's own refresh path persists rotated tokens to its auth
 * profiles.
 */
export declare class EnclawedPiCredentialStore implements CredentialStore {
    private readonly credentials;
    private chains;
    constructor(initial?: PiCredentialMap);
    /** Serialize mutations per provider id, as the CredentialStore contract requires. */
    private enqueue;
    read(providerId: string, options?: AuthOperationOptions): Promise<Credential | undefined>;
    list(options?: AuthOperationOptions): Promise<readonly CredentialInfo[]>;
    modify(providerId: string, fn: (current: Credential | undefined) => Promise<Credential | undefined>, options?: AuthOperationOptions): Promise<Credential | undefined>;
    delete(providerId: string, options?: AuthOperationOptions): Promise<void>;
    /**
     * Make `apiKey` the provider's credential for this run (the key Enclawed
     * resolved after profile selection or a runtime auth exchange). A stored
     * credential owns the provider in pi-ai, so ambient env is not consulted.
     */
    setRuntimeApiKey(providerId: string, apiKey: string): void;
    /** The provider's stored API key or OAuth access token, if any. */
    getApiKey(providerId: string): Promise<string | undefined>;
}
