import { describe, expect, it } from "vitest";
import { luhnValid, scanSecrets } from "./secrets.js";

describe("luhnValid", () => {
  it("accepts a Luhn-valid card number", () => {
    expect(luhnValid("4111 1111 1111 1111")).toBe(true);
  });
  it("rejects a Luhn-invalid number", () => {
    expect(luhnValid("4111 1111 1111 1112")).toBe(false);
  });
});

describe("scanSecrets", () => {
  it("flags an OpenAI-style key as a high-severity credential", () => {
    const matches = scanSecrets("token is sk-abcdefghijklmnopqrstuvwxyz0123");
    expect(matches.some((m) => m.kind === "openai-key" && m.severity === "high")).toBe(true);
  });

  it("flags a private-key block", () => {
    const matches = scanSecrets("-----BEGIN RSA PRIVATE KEY-----\nMIIE...");
    expect(matches.some((m) => m.kind === "private-key-block")).toBe(true);
  });

  it("flags a JWT", () => {
    const jwt = "eyJhbGciOiJIUzI1NiIs.eyJzdWIiOiIxMjM0NTY3.SflKxwRJSMeKKF2QT4";
    expect(scanSecrets(jwt).some((m) => m.kind === "jwt")).toBe(true);
  });

  it("flags a Luhn-valid card number as high severity", () => {
    const matches = scanSecrets("card 4111 1111 1111 1111 on file");
    expect(matches.some((m) => m.kind === "credit-card" && m.severity === "high")).toBe(true);
  });

  it("treats email and IP as low-severity PII", () => {
    const matches = scanSecrets("reach me at a@b.com from 10.0.0.1");
    expect(matches.every((m) => m.severity === "low")).toBe(true);
    expect(matches.map((m) => m.kind).toSorted()).toEqual(["email", "ipv4"]);
  });

  it("returns nothing for an ordinary message", () => {
    expect(scanSecrets("hey, the deploy finished, all green")).toHaveLength(0);
  });
});
