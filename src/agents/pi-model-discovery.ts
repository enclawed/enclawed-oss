import fs from "node:fs";
import path from "node:path";
import type { Api, Model } from "@mariozechner/pi-ai";
import { InMemoryModelsStore } from "@mariozechner/pi-ai";
import { ModelRegistry as PiModelRegistry, ModelRuntime } from "@mariozechner/pi-coding-agent";
import { normalizeModelCompat } from "../plugins/provider-model-compat.js";
import {
  applyProviderResolvedModelCompatWithPlugins,
  applyProviderResolvedTransportWithPlugin,
  normalizeProviderResolvedModelWithPlugin,
  resolveProviderSyntheticAuthWithPlugin,
} from "../plugins/provider-runtime.js";
import { resolveRuntimeSyntheticAuthProviderRefs } from "../plugins/synthetic-auth.runtime.js";
import { isRecord } from "../utils.js";
import { ensureAuthProfileStore } from "./auth-profiles/store.js";
import { resolveProviderEnvApiKeyCandidates } from "./model-auth-env-vars.js";
import { resolveEnvApiKey } from "./model-auth-env.js";
import {
  isDeniedModelProviderRef,
  restrictDeniedModelProviders,
} from "./model-provider-denylist.js";
import { resolvePiCredentialMapFromStore, type PiCredentialMap } from "./pi-auth-credentials.js";
import { EnclawedPiCredentialStore } from "./pi-credential-store.js";

// pi-coding-agent no longer exports AuthStorage (0.80.8+); Enclawed's
// in-memory credential store takes its place everywhere pi needs credentials.
export { EnclawedPiCredentialStore as AuthStorage, PiModelRegistry as ModelRegistry, ModelRuntime };

type ProviderRuntimeModelLike = Model<Api> & {
  contextTokens?: number;
};

type DiscoveredProviderRuntimeModelLike = Omit<ProviderRuntimeModelLike, "api"> & {
  api?: string | null;
};

export function normalizeDiscoveredPiModel<T>(value: T, agentDir: string): T {
  if (!isRecord(value)) {
    return value;
  }
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.provider !== "string"
  ) {
    return value;
  }
  const model = value as unknown as DiscoveredProviderRuntimeModelLike;
  const pluginNormalized =
    normalizeProviderResolvedModelWithPlugin({
      provider: model.provider,
      context: {
        provider: model.provider,
        modelId: model.id,
        model: model as unknown as ProviderRuntimeModelLike,
        agentDir,
      },
    }) ?? model;
  const compatNormalized =
    applyProviderResolvedModelCompatWithPlugins({
      provider: model.provider,
      context: {
        provider: model.provider,
        modelId: model.id,
        model: pluginNormalized as unknown as ProviderRuntimeModelLike,
        agentDir,
      },
    }) ?? pluginNormalized;
  const transportNormalized =
    applyProviderResolvedTransportWithPlugin({
      provider: model.provider,
      context: {
        provider: model.provider,
        modelId: model.id,
        model: compatNormalized as unknown as ProviderRuntimeModelLike,
        agentDir,
      },
    }) ?? compatNormalized;
  if (
    !isRecord(transportNormalized) ||
    typeof transportNormalized.id !== "string" ||
    typeof transportNormalized.name !== "string" ||
    typeof transportNormalized.provider !== "string" ||
    typeof transportNormalized.api !== "string"
  ) {
    return value;
  }
  return normalizeModelCompat(transportNormalized as Model<Api>) as T;
}

function createEnclawedModelRegistry(
  modelRuntime: ModelRuntime,
  agentDir: string,
): PiModelRegistry {
  const registry = new PiModelRegistry(modelRuntime);
  const getAll = registry.getAll.bind(registry);
  const getAvailable = registry.getAvailable.bind(registry);
  const find = registry.find.bind(registry);

  registry.getAll = () =>
    getAll().map((entry: Model<Api>) => normalizeDiscoveredPiModel(entry, agentDir));
  registry.getAvailable = () =>
    getAvailable().map((entry: Model<Api>) => normalizeDiscoveredPiModel(entry, agentDir));
  registry.find = (provider: string, modelId: string) =>
    normalizeDiscoveredPiModel(find(provider, modelId), agentDir);

  // Providers denied by Enclawed policy (China-based, including the ones in
  // pi's built-in catalog) can never be listed, resolved, or registered.
  restrictDeniedModelProviders(registry);
  return registry;
}

export function scrubLegacyStaticAuthJsonEntriesForDiscovery(pathname: string): void {
  if (process.env.ENCLAWED_AUTH_STORE_READONLY === "1") {
    return;
  }
  if (!fs.existsSync(pathname)) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(pathname, "utf8")) as unknown;
  } catch {
    return;
  }
  if (!isRecord(parsed)) {
    return;
  }

  let changed = false;
  for (const [provider, value] of Object.entries(parsed)) {
    if (!isRecord(value)) {
      continue;
    }
    if (value.type !== "api_key") {
      continue;
    }
    delete parsed[provider];
    changed = true;
  }

  if (!changed) {
    return;
  }

  if (Object.keys(parsed).length === 0) {
    fs.rmSync(pathname, { force: true });
    return;
  }

  fs.writeFileSync(pathname, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  fs.chmodSync(pathname, 0o600);
}

export function addEnvBackedPiCredentials(
  credentials: PiCredentialMap,
  env: NodeJS.ProcessEnv = process.env,
): PiCredentialMap {
  const next = { ...credentials };
  // pi-coding-agent hides providers from its registry when auth storage lacks
  // a matching credential entry. Mirror env-backed provider auth here so
  // live/model discovery sees the same providers runtime auth can use.
  for (const provider of Object.keys(resolveProviderEnvApiKeyCandidates({ env }))) {
    if (next[provider] || isDeniedModelProviderRef({ provider })) {
      continue;
    }
    const resolved = resolveEnvApiKey(provider, env);
    if (!resolved?.apiKey) {
      continue;
    }
    next[provider] = {
      type: "api_key",
      key: resolved.apiKey,
    };
  }
  return next;
}

export function resolvePiCredentialsForDiscovery(agentDir: string): PiCredentialMap {
  const store = ensureAuthProfileStore(agentDir, { allowKeychainPrompt: false });
  const credentials = addEnvBackedPiCredentials(resolvePiCredentialMapFromStore(store));
  for (const provider of resolveRuntimeSyntheticAuthProviderRefs()) {
    if (credentials[provider]) {
      continue;
    }
    const resolved = resolveProviderSyntheticAuthWithPlugin({
      provider,
      context: {
        config: undefined,
        provider,
        providerConfig: undefined,
      },
    });
    const apiKey = resolved?.apiKey?.trim();
    if (!apiKey) {
      continue;
    }
    credentials[provider] = {
      type: "api_key",
      key: apiKey,
    };
  }
  return credentials;
}

/**
 * Enclawed's credential store for pi, seeded with the credentials Enclawed
 * resolved for discovery (auth profiles, accepted env keys, synthetic plugin
 * auth). pi never opens its own auth.json.
 */
export function discoverAuthStorage(agentDir: string): EnclawedPiCredentialStore {
  const credentials = resolvePiCredentialsForDiscovery(agentDir);
  scrubLegacyStaticAuthJsonEntriesForDiscovery(path.join(agentDir, "auth.json"));
  return new EnclawedPiCredentialStore(credentials);
}

/**
 * pi model runtime bound to Enclawed's sources only:
 * - credentials: Enclawed's in-memory store (never `~/.pi/agent/auth.json`);
 * - models: Enclawed's generated `<agentDir>/models.json` (never `~/.pi`);
 * - catalog cache: in memory (no `models-store.json` written next to it);
 * - no network catalog refresh (`allowModelNetwork` stays off).
 */
export async function discoverModelRuntime(
  authStorage: EnclawedPiCredentialStore,
  agentDir: string,
): Promise<ModelRuntime> {
  return await ModelRuntime.create({
    credentials: authStorage,
    modelsPath: path.join(agentDir, "models.json"),
    modelsStore: new InMemoryModelsStore(),
    allowModelNetwork: false,
  });
}

/** Enclawed-policy view over a pi model runtime (normalized models, denied providers removed). */
export function createModelRegistryForRuntime(
  modelRuntime: ModelRuntime,
  agentDir: string,
): PiModelRegistry {
  return createEnclawedModelRegistry(modelRuntime, agentDir);
}

export async function discoverModels(
  authStorage: EnclawedPiCredentialStore,
  agentDir: string,
): Promise<PiModelRegistry> {
  return createEnclawedModelRegistry(await discoverModelRuntime(authStorage, agentDir), agentDir);
}
