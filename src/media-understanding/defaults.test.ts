import { describe, expect, it } from "vitest";
import {
  providerSupportsNativePdfDocument,
  resolveAutoMediaKeyProviders,
  resolveDefaultMediaModel,
} from "./defaults.js";

describe("resolveDefaultMediaModel", () => {
  it("resolves bundled audio defaults from provider metadata", () => {
    expect(resolveDefaultMediaModel({ providerId: "mistral", capability: "audio" })).toBe(
      "voxtral-mini-latest",
    );
  });

  it("resolves bundled image defaults beyond the historical core set", () => {
    expect(resolveDefaultMediaModel({ providerId: "openai-codex", capability: "image" })).toBe(
      "gpt-5.4",
    );
    expect(resolveDefaultMediaModel({ providerId: "openrouter", capability: "image" })).toBe(
      "auto",
    );
  });
});

describe("resolveAutoMediaKeyProviders", () => {
  it("keeps the bundled audio fallback order", () => {
    expect(resolveAutoMediaKeyProviders({ capability: "audio" })).toEqual([
      "openai",
      "groq",
      "deepgram",
      "google",
      "mistral",
    ]);
  });

  it("keeps the bundled image fallback order", () => {
    expect(resolveAutoMediaKeyProviders({ capability: "image" })).toEqual([
      "openai",
      "anthropic",
      "google",
    ]);
  });

  it("keeps the bundled video fallback order", () => {
    expect(resolveAutoMediaKeyProviders({ capability: "video" })).toEqual(["google"]);
  });
});

describe("providerSupportsNativePdfDocument", () => {
  it("reads native PDF support from provider metadata", () => {
    const providerRegistry = new Map([
      ["anthropic", { id: "anthropic", nativeDocumentInputs: ["pdf" as const] }],
      ["google", { id: "google", nativeDocumentInputs: ["pdf" as const] }],
      ["openai", { id: "openai", nativeDocumentInputs: [] }],
    ]);
    expect(providerSupportsNativePdfDocument({ providerId: "anthropic", providerRegistry })).toBe(
      true,
    );
    expect(providerSupportsNativePdfDocument({ providerId: "google", providerRegistry })).toBe(
      true,
    );
    expect(providerSupportsNativePdfDocument({ providerId: "openai", providerRegistry })).toBe(
      false,
    );
  });
});
