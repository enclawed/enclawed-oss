import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withTempHome } from "../../test/helpers/temp-home.js";
import type { EnclawedConfig } from "../config/types.js";
import { resolveStatusTtsSnapshot } from "./status-config.js";

describe("resolveStatusTtsSnapshot", () => {
  it("uses prefs overrides without loading speech providers", async () => {
    await withTempHome(async (home) => {
      const prefsPath = path.join(home, ".enclawed", "settings", "tts.json");
      fs.mkdirSync(path.dirname(prefsPath), { recursive: true });
      fs.writeFileSync(
        prefsPath,
        JSON.stringify({
          tts: {
            auto: "always",
            provider: "edge",
            maxLength: 2048,
            summarize: false,
          },
        }),
      );

      expect(
        resolveStatusTtsSnapshot({
          cfg: {
            messages: {
              tts: {
                prefsPath,
              },
            },
          } as EnclawedConfig,
        }),
      ).toEqual({
        autoMode: "always",
        provider: "microsoft",
        maxLength: 2048,
        summarize: false,
      });
    });
  });

  it("reports auto provider when tts is on without an explicit provider", async () => {
    await withTempHome(async () => {
      expect(
        resolveStatusTtsSnapshot({
          cfg: {
            messages: {
              tts: {
                auto: "always",
              },
            },
          } as EnclawedConfig,
        }),
      ).toEqual({
        autoMode: "always",
        provider: "auto",
        maxLength: 1500,
        summarize: true,
      });
    });
  });

  it("derives the default prefs path from ENCLAWED_CONFIG_PATH when set", async () => {
    await withTempHome(
      async (home) => {
        const stateDir = path.join(home, ".enclawed-dev");
        const prefsPath = path.join(stateDir, "settings", "tts.json");
        fs.mkdirSync(path.dirname(prefsPath), { recursive: true });
        fs.writeFileSync(
          prefsPath,
          JSON.stringify({
            tts: {
              auto: "always",
              provider: "openai",
            },
          }),
        );

        vi.stubEnv("ENCLAWED_CONFIG_PATH", path.join(stateDir, "enclawed.json"));
        try {
          expect(
            resolveStatusTtsSnapshot({
              cfg: {
                messages: {
                  tts: {},
                },
              } as EnclawedConfig,
            }),
          ).toEqual({
            autoMode: "always",
            provider: "openai",
            maxLength: 1500,
            summarize: true,
          });
        } finally {
          vi.unstubAllEnvs();
        }
      },
      { env: { ENCLAWED_STATE_DIR: undefined } },
    );
  });
});
