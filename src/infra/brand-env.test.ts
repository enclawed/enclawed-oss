import { describe, expect, it } from "vitest";
import { withEnv } from "../test-utils/env.js";
import { mirrorBrandEnv } from "./brand-env.js";

describe("mirrorBrandEnv", () => {
  it("fills ENCLAWED_X from OPENCLAW_X when only OPENCLAW_X is set", () => {
    withEnv(
      {
        OPENCLAW_BRAND_ENV_TEST_ONE: "openclaw-value",
        ENCLAWED_BRAND_ENV_TEST_ONE: undefined,
      },
      () => {
        mirrorBrandEnv();
        expect(process.env.ENCLAWED_BRAND_ENV_TEST_ONE).toBe("openclaw-value");
        expect(process.env.OPENCLAW_BRAND_ENV_TEST_ONE).toBe("openclaw-value");
      },
    );
  });

  it("fills OPENCLAW_X from ENCLAWED_X when only ENCLAWED_X is set", () => {
    withEnv(
      {
        OPENCLAW_BRAND_ENV_TEST_TWO: undefined,
        ENCLAWED_BRAND_ENV_TEST_TWO: "enclawed-value",
      },
      () => {
        mirrorBrandEnv();
        expect(process.env.OPENCLAW_BRAND_ENV_TEST_TWO).toBe("enclawed-value");
        expect(process.env.ENCLAWED_BRAND_ENV_TEST_TWO).toBe("enclawed-value");
      },
    );
  });

  it("prefers ENCLAWED_X when both are set with different values", () => {
    withEnv(
      {
        OPENCLAW_BRAND_ENV_TEST_THREE: "openclaw-loses",
        ENCLAWED_BRAND_ENV_TEST_THREE: "enclawed-wins",
      },
      () => {
        mirrorBrandEnv();
        expect(process.env.ENCLAWED_BRAND_ENV_TEST_THREE).toBe("enclawed-wins");
        expect(process.env.OPENCLAW_BRAND_ENV_TEST_THREE).toBe("enclawed-wins");
      },
    );
  });

  it("is idempotent — a second call changes nothing", () => {
    withEnv(
      {
        OPENCLAW_BRAND_ENV_TEST_FOUR: "openclaw-only",
        ENCLAWED_BRAND_ENV_TEST_FOUR: undefined,
        OPENCLAW_BRAND_ENV_TEST_FIVE: undefined,
        ENCLAWED_BRAND_ENV_TEST_FIVE: "enclawed-only",
        OPENCLAW_BRAND_ENV_TEST_SIX: "openclaw-loses",
        ENCLAWED_BRAND_ENV_TEST_SIX: "enclawed-wins",
      },
      () => {
        mirrorBrandEnv();
        const snapshotKeys = [
          "OPENCLAW_BRAND_ENV_TEST_FOUR",
          "ENCLAWED_BRAND_ENV_TEST_FOUR",
          "OPENCLAW_BRAND_ENV_TEST_FIVE",
          "ENCLAWED_BRAND_ENV_TEST_FIVE",
          "OPENCLAW_BRAND_ENV_TEST_SIX",
          "ENCLAWED_BRAND_ENV_TEST_SIX",
        ] as const;
        const after = Object.fromEntries(snapshotKeys.map((key) => [key, process.env[key]]));

        mirrorBrandEnv();
        for (const key of snapshotKeys) {
          expect(process.env[key]).toBe(after[key]);
        }

        // Sanity-check the values landed where we expect.
        expect(after.OPENCLAW_BRAND_ENV_TEST_FOUR).toBe("openclaw-only");
        expect(after.ENCLAWED_BRAND_ENV_TEST_FOUR).toBe("openclaw-only");
        expect(after.OPENCLAW_BRAND_ENV_TEST_FIVE).toBe("enclawed-only");
        expect(after.ENCLAWED_BRAND_ENV_TEST_FIVE).toBe("enclawed-only");
        expect(after.OPENCLAW_BRAND_ENV_TEST_SIX).toBe("enclawed-wins");
        expect(after.ENCLAWED_BRAND_ENV_TEST_SIX).toBe("enclawed-wins");
      },
    );
  });

  it("ignores bare OPENCLAW and ENCLAWED names without a suffix", () => {
    withEnv(
      {
        OPENCLAW: "bare-openclaw",
        ENCLAWED: "bare-enclawed",
      },
      () => {
        mirrorBrandEnv();
        // Bare names must not produce empty-suffix aliases or cross-mirror.
        expect(process.env.OPENCLAW).toBe("bare-openclaw");
        expect(process.env.ENCLAWED).toBe("bare-enclawed");
        expect(process.env.OPENCLAW_).toBeUndefined();
        expect(process.env.ENCLAWED_).toBeUndefined();
      },
    );
  });

  it("operates on the provided env object without touching process.env", () => {
    const sentinel = "should-not-appear-on-process-env";
    const scratch: NodeJS.ProcessEnv = {
      OPENCLAW_BRAND_ENV_TEST_SCRATCH: sentinel,
    };
    mirrorBrandEnv(scratch);
    expect(scratch.ENCLAWED_BRAND_ENV_TEST_SCRATCH).toBe(sentinel);
    expect(process.env.OPENCLAW_BRAND_ENV_TEST_SCRATCH).toBeUndefined();
    expect(process.env.ENCLAWED_BRAND_ENV_TEST_SCRATCH).toBeUndefined();
  });
});
