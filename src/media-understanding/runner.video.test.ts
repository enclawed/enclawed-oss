import { describe, expect, it } from "vitest";
import type { EnclawedConfig } from "../config/types.js";
import { withTempDir } from "../test-helpers/temp-dir.js";
import { runCapability } from "./runner.js";
import { withVideoFixture } from "./runner.test-utils.js";

describe("runCapability video provider wiring", () => {
  it("merges video baseUrl and headers with entry precedence", async () => {
    let seenBaseUrl: string | undefined;
    let seenHeaders: Record<string, string> | undefined;

    await withTempDir({ prefix: "enclawed-video-auth-" }, async (isolatedAgentDir) => {
      await withVideoFixture("enclawed-video-merge", async ({ ctx, media, cache }) => {
        const cfg = {
          models: {
            providers: {
              openrouter: {
                auth: "api-key",
                apiKey: "provider-key", // pragma: allowlist secret
                baseUrl: "https://provider.example/v1",
                headers: { "X-Provider": "1" },
                models: [],
              },
            },
          },
          tools: {
            media: {
              video: {
                enabled: true,
                baseUrl: "https://config.example/v1",
                headers: { "X-Config": "2" },
                models: [
                  {
                    provider: "openrouter",
                    model: "google/gemini-3-flash-preview",
                    baseUrl: "https://entry.example/v1",
                    headers: { "X-Entry": "3" },
                  },
                ],
              },
            },
          },
        } as unknown as EnclawedConfig;

        const result = await runCapability({
          capability: "video",
          cfg,
          ctx,
          agentDir: isolatedAgentDir,
          attachments: cache,
          media,
          providerRegistry: new Map([
            [
              "openrouter",
              {
                id: "openrouter",
                capabilities: ["video"],
                describeVideo: async (req) => {
                  seenBaseUrl = req.baseUrl;
                  seenHeaders = req.headers;
                  return { text: "video ok", model: req.model };
                },
              },
            ],
          ]),
        });

        expect(result.outputs[0]?.text).toBe("video ok");
        expect(result.outputs[0]?.provider).toBe("openrouter");
        expect(seenBaseUrl).toBe("https://entry.example/v1");
        expect(seenHeaders).toMatchObject({
          "X-Provider": "1",
          "X-Config": "2",
          "X-Entry": "3",
        });
      });
    });
  });
});
