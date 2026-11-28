import { describe, expect, it } from "vitest";
import {
  isAuthErrorMessage,
  isBillingErrorMessage,
  isRateLimitErrorMessage,
} from "./failover-matches.js";

describe("failover error pattern matching", () => {
  it("classifies rate limits", () => {
    expect(isRateLimitErrorMessage("rate limit exceeded")).toBe(true);
  });

  it("classifies billing errors", () => {
    expect(isBillingErrorMessage("insufficient credits")).toBe(true);
  });

  it("classifies auth errors", () => {
    expect(isAuthErrorMessage("invalid api key provided")).toBe(true);
  });
});
