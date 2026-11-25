import nodeFs from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NON_ENV_SECRETREF_MARKER } from "../agents/model-auth-markers.js";
import type { EnclawedConfig } from "../config/config.js";
import type { ModelDefinitionConfig } from "../config/types.models.js";
import { createSuiteTempRootTracker } from "../test-helpers/temp-dir.js";

vi.mock("../agents/auth-profiles.js", () => {
  const normalizeProvider = (provider?: string | null): string =>
    (provider ?? "").trim().toLowerCase();
  const dedupeProfileIds = (profileIds: string[]): string[] => [...new Set(profileIds)];
  const listProfilesForProvider = (
    store: { profiles?: Record<string, { provider?: string } | undefined> },
    provider: string,
  ): string[] =>
    Object.entries(store.profiles ?? {})
      .filter(([, profile]) => normalizeProvider(profile?.provider) === normalizeProvider(provider))
      .map(([profileId]) => profileId);
  const readStore = (agentDir?: string) => {
    if (!agentDir) {
      return { version: 1, profiles: {} };
    }
    const authPath = path.join(agentDir, "auth-profiles.json");
    try {
      const parsed = JSON.parse(nodeFs.readFileSync(authPath, "utf8")) as {
        version?: number;
        profiles?: Record<string, unknown>;
        order?: Record<string, string[]>;
        lastGood?: Record<string, string>;
        usageStats?: Record<string, unknown>;
      };
      return {
        version: parsed.version ?? 1,
        profiles: parsed.profiles ?? {},
        ...(parsed.order ? { order: parsed.order } : {}),
        ...(parsed.lastGood ? { lastGood: parsed.lastGood } : {}),
        ...(parsed.usageStats ? { usageStats: parsed.usageStats } : {}),
      };
    } catch {
      return { version: 1, profiles: {} };
    }
  };

  const resolveAuthProfileOrder = (params: {
    cfg?: { auth?: { profiles?: Record<string, { provider?: string } | undefined> } };
    store: {
      profiles: Record<string, { provider?: string } | undefined>;
      order?: Record<string, string[]>;
    };
    provider: string;
  }): string[] => {
    const provider = normalizeProvider(params.provider);
    const configured = Object.entries(params.cfg?.auth?.profiles ?? {})
      .filter(([, profile]) => normalizeProvider(profile?.provider) === provider)
      .map(([profileId]) => profileId);
    if (configured.length > 0) {
      return dedupeProfileIds(configured);
    }
    const ordered = params.store.order?.[params.provider] ?? params.store.order?.[provider];
    if (ordered?.length) {
      return dedupeProfileIds(ordered);
    }
    return dedupeProfileIds(listProfilesForProvider(params.store, provider));
  };

  const resolveApiKeyForProfile = async (params: {
    store: {
      profiles: Record<
        string,
        | {
            type?: string;
            provider?: string;
            key?: string;
            token?: string;
            accessToken?: string;
            email?: string;
            expires?: number;
          }
        | undefined
      >;
    };
    profileId: string;
  }): Promise<{ apiKey: string; provider: string; email?: string } | null> => {
    const cred = params.store.profiles[params.profileId];
    if (!cred) {
      return null;
    }
    const profileProvider = normalizeProvider(params.profileId.split(":")[0] ?? "");
    const credentialProvider = normalizeProvider(cred.provider);
    if (profileProvider && credentialProvider && profileProvider !== credentialProvider) {
      return null;
    }
    if (cred.type === "api_key") {
      return cred.key ? { apiKey: cred.key, provider: cred.provider ?? profileProvider } : null;
    }
    if (cred.type === "token") {
      if (typeof cred.expires === "number" && cred.expires <= Date.now()) {
        return null;
      }
      return cred.token
        ? { apiKey: cred.token, provider: cred.provider ?? profileProvider, email: cred.email }
        : null;
    }
    if (cred.type === "oauth") {
      if (typeof cred.expires === "number" && cred.expires <= Date.now()) {
        return null;
      }
      const token = cred.accessToken ?? cred.token;
      return token
        ? { apiKey: token, provider: cred.provider ?? profileProvider, email: cred.email }
        : null;
    }
    return null;
  };

  return {
    clearRuntimeAuthProfileStoreSnapshots: () => {},
    ensureAuthProfileStore: (agentDir?: string) => readStore(agentDir),
    dedupeProfileIds,
    listProfilesForProvider,
    resolveApiKeyForProfile,
    resolveAuthProfileOrder,
  };
});

const providerRuntimeMocks = vi.hoisted(() => ({
  providerRuntimeMock: {
    augmentModelCatalogWithProviderPlugins: vi.fn((catalog: unknown) => catalog),
    buildProviderAuthDoctorHintWithPlugin: vi.fn(() => undefined),
    buildProviderMissingAuthMessageWithPlugin: vi.fn(() => undefined),
    buildProviderUnknownModelHintWithPlugin: vi.fn(() => undefined),
    clearProviderRuntimeHookCache: vi.fn(() => {}),
    createProviderEmbeddingProvider: vi.fn(() => undefined),
    formatProviderAuthProfileApiKeyWithPlugin: vi.fn(() => undefined),
    normalizeProviderResolvedModelWithPlugin: vi.fn(() => undefined),
    prepareProviderDynamicModel: vi.fn(async () => {}),
    prepareProviderExtraParams: vi.fn(() => undefined),
    prepareProviderRuntimeAuth: vi.fn(async () => undefined),
    refreshProviderOAuthCredentialWithPlugin: vi.fn(async () => undefined),
    resetProviderRuntimeHookCacheForTest: vi.fn(() => {}),
    resolveProviderBinaryThinking: vi.fn(() => undefined),
    resolveProviderBuiltInModelSuppression: vi.fn(() => undefined),
    resolveProviderCacheTtlEligibility: vi.fn(() => undefined),
    resolveProviderCapabilitiesWithPlugin: vi.fn(() => undefined),
    resolveProviderDefaultThinkingLevel: vi.fn(() => undefined),
    resolveProviderModernModelRef: vi.fn(() => undefined),
    resolveProviderRuntimePlugin: vi.fn(() => undefined),
    resolveProviderStreamFn: vi.fn(() => undefined),
    resolveProviderSyntheticAuthWithPlugin: vi.fn(() => undefined),
    resolveProviderUsageAuthWithPlugin: vi.fn(async (params) => {
      const resolveToken = (options?: {
        providerIds?: string[];
        envDirect?: Array<string | undefined>;
      }) => params.context.resolveApiKeyFromConfigAndStore(options);
      // Usage auth is plugin-owned; this mock models an API-key style usage
      // provider so the shared key-normalization path stays covered.
      if (params.provider === "github-copilot") {
        const token = resolveToken({
          providerIds: ["github-copilot"],
          envDirect: [params.context.env?.COPILOT_USAGE_TEST_KEY],
        });
        return token ? { token } : null;
      }

      if (params.provider === "google-gemini-cli") {
        const resolved = await params.context.resolveOAuthToken({
          provider: "google-gemini-cli",
        });
        if (!resolved?.token) {
          return null;
        }
        try {
          const parsed = JSON.parse(resolved.token) as { token?: string };
          const token = parsed.token ?? resolved.token;
          return resolved.accountId ? { token, accountId: resolved.accountId } : { token };
        } catch {
          return resolved.accountId
            ? { token: resolved.token, accountId: resolved.accountId }
            : { token: resolved.token };
        }
      }

      return null;
    }),
    resolveProviderXHighThinking: vi.fn(() => undefined),
    runProviderDynamicModel: vi.fn(() => undefined),
    wrapProviderStreamFn: vi.fn(() => undefined),
  },
}));

vi.mock("../plugins/provider-runtime.js", async () => {
  const actual = await vi.importActual<typeof import("../plugins/provider-runtime.js")>(
    "../plugins/provider-runtime.js",
  );
  return {
    ...actual,
    ...providerRuntimeMocks.providerRuntimeMock,
  };
});

vi.mock("../plugins/provider-runtime.ts", async () => {
  const actual = await vi.importActual<typeof import("../plugins/provider-runtime.ts")>(
    "../plugins/provider-runtime.ts",
  );
  return {
    ...actual,
    ...providerRuntimeMocks.providerRuntimeMock,
  };
});

vi.mock("../agents/cli-credentials.js", () => ({
  readCodexCliCredentialsCached: () => null,
}));

vi.mock("../agents/auth-profiles/external-cli-sync.js", () => ({
  syncExternalCliCredentials: () => false,
}));

let resolveProviderAuths: typeof import("./provider-usage.auth.js").resolveProviderAuths;
let clearRuntimeAuthProfileStoreSnapshots: typeof import("../agents/auth-profiles.js").clearRuntimeAuthProfileStoreSnapshots;
let clearConfigCache: typeof import("../config/config.js").clearConfigCache;
let clearRuntimeConfigSnapshot: typeof import("../config/config.js").clearRuntimeConfigSnapshot;
const suiteRootTracker = createSuiteTempRootTracker({ prefix: "enclawed-provider-auth-suite-" });

describe("resolveProviderAuths key normalization", () => {
  const EMPTY_PROVIDER_ENV = {
    COPILOT_USAGE_TEST_KEY: undefined,
  } satisfies Record<string, string | undefined>;

  beforeAll(async () => {
    await suiteRootTracker.setup();
    ({ resolveProviderAuths } = await import("./provider-usage.auth.js"));
    ({ clearRuntimeAuthProfileStoreSnapshots } = await import("../agents/auth-profiles.js"));
    ({ clearConfigCache, clearRuntimeConfigSnapshot } = await import("../config/config.js"));
  });

  afterAll(async () => {
    await suiteRootTracker.cleanup();
  });

  beforeEach(() => {
    clearRuntimeConfigSnapshot();
    clearConfigCache();
    clearRuntimeAuthProfileStoreSnapshots();
  });

  afterEach(() => {
    clearRuntimeConfigSnapshot();
    clearConfigCache();
    clearRuntimeAuthProfileStoreSnapshots();
    vi.restoreAllMocks();
  });

  async function withSuiteHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
    const base = await suiteRootTracker.make("case");
    const stateDir = path.join(base, ".enclawed");
    const agentDir = path.join(stateDir, "agents", "main", "agent");
    nodeFs.mkdirSync(path.join(stateDir, "agents", "main", "sessions"), { recursive: true });
    nodeFs.mkdirSync(agentDir, { recursive: true });
    nodeFs.writeFileSync(
      path.join(agentDir, "auth-profiles.json"),
      `${JSON.stringify({ version: 1, profiles: {} }, null, 2)}\n`,
      "utf8",
    );
    return await fn(base);
  }

  function agentDirForHome(home: string): string {
    return path.join(home, ".enclawed", "agents", "main", "agent");
  }

  function buildSuiteEnv(
    home: string,
    env: Record<string, string | undefined> = {},
  ): NodeJS.ProcessEnv {
    const suiteEnv: NodeJS.ProcessEnv = {
      ...EMPTY_PROVIDER_ENV,
      HOME: home,
      USERPROFILE: home,
      ENCLAWED_STATE_DIR: path.join(home, ".enclawed"),
      ...env,
    };
    const match = home.match(/^([A-Za-z]:)(.*)$/);
    if (match) {
      suiteEnv.HOMEDRIVE = match[1];
      suiteEnv.HOMEPATH = match[2] || "\\";
    }
    return suiteEnv;
  }

  async function writeAuthProfiles(home: string, profiles: Record<string, unknown>) {
    const agentDir = agentDirForHome(home);
    await fs.mkdir(agentDir, { recursive: true });
    await fs.writeFile(
      path.join(agentDir, "auth-profiles.json"),
      `${JSON.stringify({ version: 1, profiles }, null, 2)}\n`,
      "utf8",
    );
  }

  async function writeConfig(home: string, config: Record<string, unknown>) {
    const stateDir = path.join(home, ".enclawed");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "enclawed.json"),
      `${JSON.stringify(config, null, 2)}\n`,
      "utf8",
    );
  }

  async function writeProfileOrder(home: string, provider: string, profileIds: string[]) {
    const agentDir = agentDirForHome(home);
    const parsed = JSON.parse(
      await fs.readFile(path.join(agentDir, "auth-profiles.json"), "utf8"),
    ) as Record<string, unknown>;
    const order = (parsed.order && typeof parsed.order === "object" ? parsed.order : {}) as Record<
      string,
      unknown
    >;
    order[provider] = profileIds;
    parsed.order = order;
    await fs.writeFile(
      path.join(agentDir, "auth-profiles.json"),
      `${JSON.stringify(parsed, null, 2)}\n`,
    );
  }

  function createTestModelDefinition(): ModelDefinitionConfig {
    return {
      id: "test-model",
      name: "Test Model",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 1024,
      maxTokens: 256,
    };
  }

  async function resolveCopilotAuthFromConfiguredKey(apiKey: string) {
    return await withSuiteHome(async (home) => {
      const config = {
        models: {
          providers: {
            "github-copilot": {
              baseUrl: "https://api.individual.githubcopilot.com",
              models: [createTestModelDefinition()],
              apiKey,
            },
          },
        },
      } satisfies EnclawedConfig;
      await writeConfig(home, config);

      return await resolveProviderAuths({
        providers: ["github-copilot"],
        agentDir: agentDirForHome(home),
        config,
        env: buildSuiteEnv(home),
      });
    });
  }

  async function expectResolvedAuthsFromSuiteHome(params: {
    providers: Parameters<typeof resolveProviderAuths>[0]["providers"];
    expected: Awaited<ReturnType<typeof resolveProviderAuths>>;
    env?: Record<string, string | undefined>;
    config?: EnclawedConfig;
    setup?: (home: string) => Promise<void>;
  }) {
    await withSuiteHome(async (home) => {
      if (params.setup) {
        await params.setup(home);
      }
      const config = params.config ?? {};
      const auths = await resolveProviderAuths({
        providers: params.providers,
        agentDir: agentDirForHome(home),
        config,
        env: buildSuiteEnv(home, params.env),
      });
      expect(auths).toEqual(params.expected);
    });
  }

  it("strips embedded CR/LF from env keys", async () => {
    await expectResolvedAuthsFromSuiteHome({
      providers: ["github-copilot"],
      env: {
        COPILOT_USAGE_TEST_KEY: "copilot-\r\nkey",
      },
      expected: [{ provider: "github-copilot", token: "copilot-key" }],
    });
  }, 300_000);

  it("strips embedded CR/LF from stored auth profiles (token + api_key)", async () => {
    await expectResolvedAuthsFromSuiteHome({
      providers: ["github-copilot"],
      setup: async (home) => {
        await writeAuthProfiles(home, {
          "github-copilot:default": {
            type: "token",
            provider: "github-copilot",
            token: "copi-\r\nlot",
          },
        });
      },
      expected: [{ provider: "github-copilot", token: "copi-lot" }],
    });
    await expectResolvedAuthsFromSuiteHome({
      providers: ["github-copilot"],
      setup: async (home) => {
        await writeAuthProfiles(home, {
          "github-copilot:default": {
            type: "api_key",
            provider: "github-copilot",
            key: "copi-\r\nkey",
          },
        });
      },
      expected: [{ provider: "github-copilot", token: "copi-key" }],
    });
  });

  it("returns injected auth values unchanged", async () => {
    const auths = await resolveProviderAuths({
      providers: ["anthropic"],
      auth: [{ provider: "anthropic", token: "token-1", accountId: "acc-1" }],
    });
    expect(auths).toEqual([{ provider: "anthropic", token: "token-1", accountId: "acc-1" }]);
  });

  it.each([
    {
      name: "extracts google oauth token from JSON payload in token profiles",
      token: '{"token":"google-oauth-token"}',
      expectedToken: "google-oauth-token",
    },
    {
      name: "keeps raw google token when token payload is not JSON",
      token: "plain-google-token",
      expectedToken: "plain-google-token",
    },
  ])("$name", async ({ token, expectedToken }) => {
    const googleGeminiCliUsageProvider = "google-gemini-cli" as unknown as Parameters<
      typeof resolveProviderAuths
    >[0]["providers"][number];
    await expectResolvedAuthsFromSuiteHome({
      providers: [googleGeminiCliUsageProvider],
      setup: async (home) => {
        await writeAuthProfiles(home, {
          "google-gemini-cli:default": {
            type: "token",
            provider: "google-gemini-cli",
            token,
          },
        });
      },
      expected: [{ provider: googleGeminiCliUsageProvider, token: expectedToken }],
    });
  });

  it("uses config api keys when env and profiles are missing", async () => {
    const config = {
      models: {
        providers: {
          "github-copilot": {
            baseUrl: "https://api.individual.githubcopilot.com",
            models: [createTestModelDefinition()],
            apiKey: "cfg-copilot-key", // pragma: allowlist secret
          },
        },
      },
    } satisfies EnclawedConfig;
    await expectResolvedAuthsFromSuiteHome({
      providers: ["github-copilot"],
      setup: async (home) => {
        await writeConfig(home, config);
      },
      config,
      expected: [{ provider: "github-copilot", token: "cfg-copilot-key" }],
    });
  });

  it("returns no auth when providers have no configured credentials", async () => {
    await expectResolvedAuthsFromSuiteHome({
      providers: ["github-copilot"],
      expected: [],
    });
  });

  it("discovers oauth provider from config but skips mismatched profile providers", async () => {
    await withSuiteHome(async (home) => {
      const config = {
        auth: {
          profiles: {
            "anthropic:default": { provider: "anthropic", mode: "token" },
          },
        },
      } satisfies EnclawedConfig;
      await writeConfig(home, config);
      await writeAuthProfiles(home, {
        "anthropic:default": {
          type: "token",
          provider: "github-copilot",
          token: "mismatched-provider-token",
        },
      });

      const auths = await resolveProviderAuths({
        providers: ["anthropic"],
        agentDir: agentDirForHome(home),
        config,
        env: buildSuiteEnv(home),
      });
      expect(auths).toEqual([]);
    });
  });

  it("skips providers without oauth-compatible profiles", async () => {
    await withSuiteHome(async (home) => {
      const auths = await resolveProviderAuths({
        providers: ["anthropic"],
        agentDir: agentDirForHome(home),
        config: {},
        env: buildSuiteEnv(home),
      });
      expect(auths).toEqual([]);
    });
  });

  it("skips oauth profiles that resolve without an api key and uses later profiles", async () => {
    await withSuiteHome(async (home) => {
      await writeAuthProfiles(home, {
        "anthropic:empty": {
          type: "token",
          provider: "anthropic",
          token: "expired-token",
          expires: Date.now() - 60_000,
        },
        "anthropic:valid": { type: "token", provider: "anthropic", token: "anthropic-token" },
      });
      await writeProfileOrder(home, "anthropic", ["anthropic:empty", "anthropic:valid"]);

      const auths = await resolveProviderAuths({
        providers: ["anthropic"],
        agentDir: agentDirForHome(home),
        config: {},
        env: buildSuiteEnv(home),
      });
      expect(auths).toEqual([{ provider: "anthropic", token: "anthropic-token" }]);
    });
  });

  it("skips api_key entries in oauth token resolution order", async () => {
    await withSuiteHome(async (home) => {
      await writeAuthProfiles(home, {
        "anthropic:api": { type: "api_key", provider: "anthropic", key: "api-key-1" },
        "anthropic:token": { type: "token", provider: "anthropic", token: "token-1" },
      });
      await writeProfileOrder(home, "anthropic", ["anthropic:api", "anthropic:token"]);

      const auths = await resolveProviderAuths({
        providers: ["anthropic"],
        agentDir: agentDirForHome(home),
        config: {},
        env: buildSuiteEnv(home),
      });
      expect(auths).toEqual([{ provider: "anthropic", token: "token-1" }]);
    });
  });

  it("ignores marker-backed config keys for provider usage auth resolution", async () => {
    const auths = await resolveCopilotAuthFromConfiguredKey(NON_ENV_SECRETREF_MARKER);
    expect(auths).toEqual([]);
  });

  it("keeps all-caps plaintext config keys eligible for provider usage auth resolution", async () => {
    const auths = await resolveCopilotAuthFromConfiguredKey("ALLCAPS_SAMPLE");
    expect(auths).toEqual([{ provider: "github-copilot", token: "ALLCAPS_SAMPLE" }]);
  });
});
