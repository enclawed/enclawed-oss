import { describe, expect, it } from "vitest";
import { EnclawedSchema } from "./zod-schema.js";

// Settings audit #22: gateway.auth.rateLimit had no bounds, so one config line
// (maxAttempts=1e9, windowMs=0, lockoutMs=0, a negative value) removed
// brute-force protection on gateway auth.

function parse(rateLimit: Record<string, unknown>) {
  return EnclawedSchema.safeParse({ gateway: { auth: { mode: "token", rateLimit } } });
}

describe("gateway.auth.rateLimit bounds", () => {
  it.each([
    { maxAttempts: 1e9 },
    { maxAttempts: 21 },
    { maxAttempts: 2 },
    { maxAttempts: -1 },
    { maxAttempts: 5.5 },
    { maxAttempts: Number.POSITIVE_INFINITY },
    { windowMs: 0 },
    { windowMs: 9_999 },
    { windowMs: 600_001 },
    { lockoutMs: 0 },
    { lockoutMs: 59_999 },
    { lockoutMs: 3_600_001 },
    { lockoutMs: Number.NaN },
  ])("attack: refuses %o", (rateLimit) => {
    expect(parse(rateLimit).success).toBe(false);
  });

  it.each([
    {},
    { maxAttempts: 10, windowMs: 60_000, lockoutMs: 300_000, exemptLoopback: true },
    { maxAttempts: 3, windowMs: 10_000, lockoutMs: 60_000 },
    { maxAttempts: 20, windowMs: 600_000, lockoutMs: 3_600_000, exemptLoopback: false },
  ])("FP: accepts %o", (rateLimit) => {
    expect(parse(rateLimit).success).toBe(true);
  });
});
