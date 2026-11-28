import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { captureEnv } from "../test-utils/env.js";

vi.mock("../plugins/provider-runtime.js", () => ({
  resolveProviderSyntheticAuthWithPlugin: vi.fn(),
}));

type ProviderRuntimeModule = typeof import("../plugins/provider-runtime.js");

let NON_ENV_SECRETREF_MARKER: typeof import("./model-auth-markers.js").NON_ENV_SECRETREF_MARKER;
let CUSTOM_LOCAL_AUTH_MARKER: typeof import("./model-auth-markers.js").CUSTOM_LOCAL_AUTH_MARKER;
let resolveApiKeyFromCredential: typeof import("./models-config.providers.secrets.js").resolveApiKeyFromCredential;
let createProviderAuthResolver: typeof import("./models-config.providers.secrets.js").createProviderAuthResolver;
let mockedResolveProviderSyntheticAuthWithPlugin: ReturnType<
  typeof vi.mocked<ProviderRuntimeModule["resolveProviderSyntheticAuthWithPlugin"]>
>;

async function loadProviderAuthModules() {
  vi.doUnmock("../plugins/manifest-registry.js");
  vi.doUnmock("../secrets/provider-env-vars.js");
  const [providerRuntimeModule, markersModule, secretsModule] = await Promise.all([
    import("../plugins/provider-runtime.js"),
    import("./model-auth-markers.js"),
    import("./models-config.providers.secrets.js"),
  ]);
  mockedResolveProviderSyntheticAuthWithPlugin = vi.mocked(
    providerRuntimeModule.resolveProviderSyntheticAuthWithPlugin,
  );
  CUSTOM_LOCAL_AUTH_MARKER = markersModule.CUSTOM_LOCAL_AUTH_MARKER;
  NON_ENV_SECRETREF_MARKER = markersModule.NON_ENV_SECRETREF_MARKER;
  resolveApiKeyFromCredential = secretsModule.resolveApiKeyFromCredential;
  createProviderAuthResolver = secretsModule.createProviderAuthResolver;
}

beforeEach(() => {
  vi.doUnmock("../plugins/manifest-registry.js");
  vi.doUnmock("../secrets/provider-env-vars.js");
  mockedResolveProviderSyntheticAuthWithPlugin.mockReset().mockReturnValue(undefined);
});

beforeAll(loadProviderAuthModules);

function buildPairedApiKeyProviders(apiKey: string) {
  return {
    provider: { apiKey },
    paired: { apiKey },
  };
}

describe("models-config provider auth provenance", () => {
  it("persists env keyRef and tokenRef auth profiles as env var markers", () => {
    const envSnapshot = captureEnv(["FIREWORKS_API_KEY", "TOGETHER_API_KEY"]);
    delete process.env.FIREWORKS_API_KEY;
    delete process.env.TOGETHER_API_KEY;
    try {
      const fireworksApiKey = resolveApiKeyFromCredential({
        type: "api_key",
        provider: "fireworks",
        keyRef: { source: "env", provider: "default", id: "FIREWORKS_API_KEY" },
      })?.apiKey;
      const togetherApiKey = resolveApiKeyFromCredential({
        type: "token",
        provider: "together",
        tokenRef: { source: "env", provider: "default", id: "TOGETHER_API_KEY" },
      })?.apiKey;
      const fireworksProviders = buildPairedApiKeyProviders(fireworksApiKey ?? "");

      expect(fireworksProviders.provider.apiKey).toBe("FIREWORKS_API_KEY");
      expect(fireworksProviders.paired.apiKey).toBe("FIREWORKS_API_KEY");
      expect(togetherApiKey).toBe("TOGETHER_API_KEY");
    } finally {
      envSnapshot.restore();
    }
  });

  it("uses non-env marker for ref-managed profiles even when runtime plaintext is present", () => {
    const deepinfraApiKey = resolveApiKeyFromCredential({
      type: "api_key",
      provider: "deepinfra",
      key: "sk-runtime-resolved-deepinfra",
      keyRef: { source: "file", provider: "vault", id: "/deepinfra/apiKey" },
    })?.apiKey;
    const togetherApiKey = resolveApiKeyFromCredential({
      type: "token",
      provider: "together",
      token: "tok-runtime-resolved-together",
      tokenRef: { source: "exec", provider: "vault", id: "providers/together/token" },
    })?.apiKey;
    const deepinfraProviders = buildPairedApiKeyProviders(deepinfraApiKey ?? "");

    expect(deepinfraProviders.provider.apiKey).toBe(NON_ENV_SECRETREF_MARKER);
    expect(deepinfraProviders.paired.apiKey).toBe(NON_ENV_SECRETREF_MARKER);
    expect(togetherApiKey).toBe(NON_ENV_SECRETREF_MARKER);
  });

  it("prefers profile auth over env auth in provider summaries to match runtime resolution", () => {
    const auth = createProviderAuthResolver(
      {
        OPENAI_API_KEY: "env-openai-key",
      } as NodeJS.ProcessEnv,
      {
        version: 1,
        profiles: {
          "openai:default": {
            type: "api_key",
            provider: "openai",
            keyRef: { source: "env", provider: "default", id: "OPENAI_PROFILE_KEY" },
          },
        },
      },
    );

    expect(auth("openai")).toEqual({
      apiKey: "OPENAI_PROFILE_KEY",
      discoveryApiKey: undefined,
      mode: "api_key",
      source: "profile",
      profileId: "openai:default",
    });
  });

  it("resolves plugin-owned synthetic auth through the provider hook", () => {
    mockedResolveProviderSyntheticAuthWithPlugin.mockReturnValue({
      apiKey: "xai-plugin-key",
      mode: "api-key",
      source: "test plugin",
    });
    const auth = createProviderAuthResolver(
      {} as NodeJS.ProcessEnv,
      {
        version: 1,
        profiles: {},
      },
      {
        plugins: {
          entries: {
            xai: {
              config: {
                webSearch: {
                  apiKey: "xai-plugin-key",
                },
              },
            },
          },
        },
      },
    );

    expect(auth("xai")).toEqual({
      apiKey: NON_ENV_SECRETREF_MARKER,
      discoveryApiKey: "xai-plugin-key",
      mode: "api_key",
      source: "none",
    });
  });

  it("preserves shared non-secret synthetic auth markers from provider hooks", () => {
    mockedResolveProviderSyntheticAuthWithPlugin.mockReturnValue({
      apiKey: CUSTOM_LOCAL_AUTH_MARKER,
      mode: "api-key",
      source: "test plugin",
    });
    const auth = createProviderAuthResolver(
      {} as NodeJS.ProcessEnv,
      {
        version: 1,
        profiles: {},
      },
      {
        plugins: {
          entries: {
            lmstudio: {
              config: {
                models: [{ id: "qwen/qwen3.5-9b" }],
              },
            },
          },
        },
      },
    );

    expect(auth("lmstudio")).toEqual({
      apiKey: CUSTOM_LOCAL_AUTH_MARKER,
      discoveryApiKey: undefined,
      mode: "api_key",
      source: "none",
    });
  });
});
