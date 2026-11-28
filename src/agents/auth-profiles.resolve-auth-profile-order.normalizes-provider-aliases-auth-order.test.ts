import { describe, expect, it } from "vitest";
import { type AuthProfileStore, resolveAuthProfileOrder } from "./auth-profiles.js";

function makeApiKeyStore(provider: string, profileIds: string[]): AuthProfileStore {
  return {
    version: 1,
    profiles: Object.fromEntries(
      profileIds.map((profileId) => [
        profileId,
        {
          type: "api_key",
          provider,
          key: profileId.endsWith(":work") ? "sk-work" : "sk-default",
        },
      ]),
    ),
  };
}

function makeApiKeyProfilesByProviderProvider(
  providerByProfileId: Record<string, string>,
): Record<string, { provider: string; mode: "api_key" }> {
  return Object.fromEntries(
    Object.entries(providerByProfileId).map(([profileId, provider]) => [
      profileId,
      { provider, mode: "api_key" },
    ]),
  );
}

describe("resolveAuthProfileOrder", () => {
  it("normalizes provider aliases in auth.order", () => {
    const order = resolveAuthProfileOrder({
      cfg: {
        auth: {
          order: { "aws-bedrock": ["amazon-bedrock:work", "amazon-bedrock:default"] },
          profiles: makeApiKeyProfilesByProviderProvider({
            "amazon-bedrock:default": "amazon-bedrock",
            "amazon-bedrock:work": "amazon-bedrock",
          }),
        },
      },
      store: makeApiKeyStore("amazon-bedrock", ["amazon-bedrock:default", "amazon-bedrock:work"]),
      provider: "amazon-bedrock",
    });
    expect(order).toEqual(["amazon-bedrock:work", "amazon-bedrock:default"]);
  });
  it("normalizes provider casing in auth.order keys", () => {
    const order = resolveAuthProfileOrder({
      cfg: {
        auth: {
          order: { OpenAI: ["openai:work", "openai:default"] },
          profiles: makeApiKeyProfilesByProviderProvider({
            "openai:default": "openai",
            "openai:work": "openai",
          }),
        },
      },
      store: makeApiKeyStore("openai", ["openai:default", "openai:work"]),
      provider: "openai",
    });
    expect(order).toEqual(["openai:work", "openai:default"]);
  });
  it("normalizes provider aliases in auth.profiles", () => {
    const order = resolveAuthProfileOrder({
      cfg: {
        auth: {
          profiles: makeApiKeyProfilesByProviderProvider({
            "amazon-bedrock:default": "bedrock",
            "amazon-bedrock:work": "AWS-Bedrock",
          }),
        },
      },
      store: makeApiKeyStore("amazon-bedrock", ["amazon-bedrock:default", "amazon-bedrock:work"]),
      provider: "amazon-bedrock",
    });
    expect(order).toEqual(["amazon-bedrock:default", "amazon-bedrock:work"]);
  });
  it("prioritizes oauth profiles when order missing", () => {
    const mixedStore: AuthProfileStore = {
      version: 1,
      profiles: {
        "anthropic:default": {
          type: "api_key",
          provider: "anthropic",
          key: "sk-default",
        },
        "anthropic:oauth": {
          type: "oauth",
          provider: "anthropic",
          access: "access-token",
          refresh: "refresh-token",
          expires: Date.now() + 60_000,
        },
      },
    };
    const order = resolveAuthProfileOrder({
      store: mixedStore,
      provider: "anthropic",
    });
    expect(order).toEqual(["anthropic:oauth", "anthropic:default"]);
  });
});
