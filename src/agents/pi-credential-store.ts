import type {
  AuthOperationOptions,
  Credential,
  CredentialInfo,
  CredentialStore,
} from "@mariozechner/pi-ai";
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
export class EnclawedPiCredentialStore implements CredentialStore {
  private readonly credentials = new Map<string, Credential>();
  private chains = new Map<string, Promise<unknown>>();

  constructor(initial: PiCredentialMap = {}) {
    for (const [providerId, credential] of Object.entries(initial)) {
      this.credentials.set(providerId, { ...credential });
    }
  }

  /** Serialize mutations per provider id, as the CredentialStore contract requires. */
  private enqueue<T>(providerId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(providerId) ?? Promise.resolve();
    const next = previous.then(task, task);
    this.chains.set(
      providerId,
      next.catch(() => undefined),
    );
    return next;
  }

  async read(providerId: string, options?: AuthOperationOptions): Promise<Credential | undefined> {
    options?.signal?.throwIfAborted();
    const credential = this.credentials.get(providerId);
    return credential ? { ...credential } : undefined;
  }

  async list(options?: AuthOperationOptions): Promise<readonly CredentialInfo[]> {
    options?.signal?.throwIfAborted();
    return [...this.credentials.entries()]
      .map(([providerId, credential]) => ({ providerId, type: credential.type }))
      .toSorted((left, right) => left.providerId.localeCompare(right.providerId));
  }

  modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
    options?: AuthOperationOptions,
  ): Promise<Credential | undefined> {
    options?.signal?.throwIfAborted();
    return this.enqueue(providerId, async () => {
      const current = this.credentials.get(providerId);
      const next = await fn(current ? { ...current } : undefined);
      if (next) {
        this.credentials.set(providerId, { ...next });
      }
      const stored = this.credentials.get(providerId);
      return stored ? { ...stored } : undefined;
    });
  }

  delete(providerId: string, options?: AuthOperationOptions): Promise<void> {
    options?.signal?.throwIfAborted();
    return this.enqueue(providerId, async () => {
      this.credentials.delete(providerId);
    });
  }

  /**
   * Make `apiKey` the provider's credential for this run (the key Enclawed
   * resolved after profile selection or a runtime auth exchange). A stored
   * credential owns the provider in pi-ai, so ambient env is not consulted.
   */
  setRuntimeApiKey(providerId: string, apiKey: string): void {
    this.credentials.set(providerId, { type: "api_key", key: apiKey });
  }

  /** The provider's stored API key or OAuth access token, if any. */
  async getApiKey(providerId: string): Promise<string | undefined> {
    const credential = this.credentials.get(providerId);
    if (!credential) {
      return undefined;
    }
    return credential.type === "api_key" ? credential.key : credential.access;
  }
}
