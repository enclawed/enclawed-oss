import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GATEWAY_PORT,
  resolveConfigPathCandidate,
  resolveGatewayPort,
  resolveIsNixMode,
  resolveStateDir,
} from "./config.js";
import { withTempHome } from "./test-helpers.js";

vi.unmock("../version.js");

function envWith(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  // Hermetic env: don't inherit process.env because other tests may mutate it.
  return { ...overrides };
}

describe("Nix integration (U3, U5, U9)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("U3: isNixMode env var detection", () => {
    it("isNixMode is false when ENCLAWED_NIX_MODE is not set", () => {
      expect(resolveIsNixMode(envWith({ ENCLAWED_NIX_MODE: undefined }))).toBe(false);
    });

    it("isNixMode is false when ENCLAWED_NIX_MODE is empty", () => {
      expect(resolveIsNixMode(envWith({ ENCLAWED_NIX_MODE: "" }))).toBe(false);
    });

    it("isNixMode is false when ENCLAWED_NIX_MODE is not '1'", () => {
      expect(resolveIsNixMode(envWith({ ENCLAWED_NIX_MODE: "true" }))).toBe(false);
    });

    it("isNixMode is true when ENCLAWED_NIX_MODE=1", () => {
      expect(resolveIsNixMode(envWith({ ENCLAWED_NIX_MODE: "1" }))).toBe(true);
    });
  });

  describe("U5: CONFIG_PATH and STATE_DIR env var overrides", () => {
    it("STATE_DIR defaults to ~/.enclawed when env not set", () => {
      expect(resolveStateDir(envWith({ ENCLAWED_STATE_DIR: undefined }))).toMatch(/\.enclawed$/);
    });

    it("STATE_DIR respects ENCLAWED_STATE_DIR override", () => {
      expect(resolveStateDir(envWith({ ENCLAWED_STATE_DIR: "/custom/state/dir" }))).toBe(
        path.resolve("/custom/state/dir"),
      );
    });

    it("STATE_DIR respects ENCLAWED_HOME when state override is unset", () => {
      const customHome = path.join(path.sep, "custom", "home");
      expect(
        resolveStateDir(envWith({ ENCLAWED_HOME: customHome, ENCLAWED_STATE_DIR: undefined })),
      ).toBe(path.join(path.resolve(customHome), ".enclawed"));
    });

    it("CONFIG_PATH defaults to ENCLAWED_HOME/.enclawed/enclawed.json", () => {
      const customHome = path.join(path.sep, "custom", "home");
      expect(
        resolveConfigPathCandidate(
          envWith({
            ENCLAWED_HOME: customHome,
            ENCLAWED_CONFIG_PATH: undefined,
            ENCLAWED_STATE_DIR: undefined,
          }),
        ),
      ).toBe(path.join(path.resolve(customHome), ".enclawed", "enclawed.json"));
    });

    it("CONFIG_PATH defaults to ~/.enclawed/enclawed.json when env not set", () => {
      expect(
        resolveConfigPathCandidate(
          envWith({ ENCLAWED_CONFIG_PATH: undefined, ENCLAWED_STATE_DIR: undefined }),
        ),
      ).toMatch(/\.enclawed[\\/]enclawed\.json$/);
    });

    it("CONFIG_PATH respects ENCLAWED_CONFIG_PATH override", () => {
      expect(
        resolveConfigPathCandidate(
          envWith({ ENCLAWED_CONFIG_PATH: "/nix/store/abc/enclawed.json" }),
        ),
      ).toBe(path.resolve("/nix/store/abc/enclawed.json"));
    });

    it("CONFIG_PATH expands ~ in ENCLAWED_CONFIG_PATH override", async () => {
      await withTempHome(async (home) => {
        expect(
          resolveConfigPathCandidate(
            envWith({ ENCLAWED_HOME: home, ENCLAWED_CONFIG_PATH: "~/.enclawed/custom.json" }),
            () => home,
          ),
        ).toBe(path.join(home, ".enclawed", "custom.json"));
      });
    });

    it("CONFIG_PATH uses STATE_DIR when only state dir is overridden", () => {
      expect(
        resolveConfigPathCandidate(
          envWith({ ENCLAWED_STATE_DIR: "/custom/state", ENCLAWED_TEST_FAST: "1" }),
          () => path.join(path.sep, "tmp", "enclawed-config-home"),
        ),
      ).toBe(path.join(path.resolve("/custom/state"), "enclawed.json"));
    });
  });

  describe("U6: gateway port resolution", () => {
    it("uses default when env and config are unset", () => {
      expect(resolveGatewayPort({}, envWith({ ENCLAWED_GATEWAY_PORT: undefined }))).toBe(
        DEFAULT_GATEWAY_PORT,
      );
    });

    it("prefers ENCLAWED_GATEWAY_PORT over config", () => {
      expect(
        resolveGatewayPort(
          { gateway: { port: 19002 } },
          envWith({ ENCLAWED_GATEWAY_PORT: "19001" }),
        ),
      ).toBe(19001);
    });

    it("falls back to config when env is invalid", () => {
      expect(
        resolveGatewayPort(
          { gateway: { port: 19003 } },
          envWith({ ENCLAWED_GATEWAY_PORT: "nope" }),
        ),
      ).toBe(19003);
    });
  });
});
