// The unlock grant's host-side bounds: up to 65 535 uses and a 36 h lease; anything outside is
// refused before the device is asked.
import { describe, expect, it } from "vitest";
import {
  UNLOCK_LEASE_MAX_S,
  UNLOCK_LEASE_MIN_S,
  UNLOCK_USES_MAX,
  grantUnlock,
} from "./device-factors.js";

// A transport whose device never answers: a request that reaches it fails as no-response.
const silent = {
  kind: "direct" as const,
  dev: { request: async () => null },
};

const grant = (uses: number, leaseS: number) =>
  grantUnlock(silent, Buffer.alloc(32), Buffer.alloc(12), {
    code: "123456",
    uses,
    leaseS,
    scope: Buffer.alloc(32),
  });

describe("unlock grant bounds", () => {
  it("are 1..65535 uses and 30 s..36 h", () => {
    expect(UNLOCK_USES_MAX).toBe(65_535);
    expect(UNLOCK_LEASE_MIN_S).toBe(30);
    expect(UNLOCK_LEASE_MAX_S).toBe(36 * 3600);
  });

  it("refuses anything outside them before asking the device, and asks inside them", async () => {
    for (const [uses, lease] of [
      [0, 600],
      [65_536, 600],
      [1.5, 600],
      [1, 29],
      [1, 129_601],
    ]) {
      expect(await grant(uses, lease)).toEqual({ ok: false, code: "malformed" });
    }
    for (const [uses, lease] of [
      [65_535, 129_600],
      [64, 43_200],
      [1, 30],
    ]) {
      expect(!(await grant(uses, lease)).ok && (await grant(uses, lease))).not.toEqual({
        ok: false,
        code: "malformed",
      });
    }
  });
});
