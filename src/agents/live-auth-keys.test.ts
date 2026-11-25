import { beforeAll, describe, expect, it, vi } from "vitest";

vi.unmock("../secrets/provider-env-vars.js");

let collectProviderApiKeys: typeof import("./live-auth-keys.js").collectProviderApiKeys;

async function loadModulesForTest(): Promise<void> {
  vi.resetModules();
  vi.doUnmock("../secrets/provider-env-vars.js");
  ({ collectProviderApiKeys } = await import("./live-auth-keys.js"));
}

describe("collectProviderApiKeys", () => {
  beforeAll(async () => {
    await loadModulesForTest();
  });

  it("honors provider auth env vars with nonstandard names", async () => {
    const env = { CLOUDFLARE_AI_GATEWAY_API_KEY: "gateway-live-key" };

    expect(
      collectProviderApiKeys("cloudflare-ai-gateway", {
        env,
        providerEnvVars: ["CLOUDFLARE_AI_GATEWAY_API_KEY", "CF_AI_GATEWAY_TOKEN"],
      }),
    ).toEqual(["gateway-live-key"]);
  });

  it("dedupes manifest env vars against direct provider env naming", async () => {
    const env = { XAI_API_KEY: "xai-live-key" };

    expect(
      collectProviderApiKeys("xai", {
        env,
        providerEnvVars: ["XAI_API_KEY"],
      }),
    ).toEqual(["xai-live-key"]);
  });
});
