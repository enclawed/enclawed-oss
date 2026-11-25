import { describe, expect, it } from "vitest";
import { resolveActiveErrorContext } from "./helpers.js";

describe("resolveActiveErrorContext", () => {
  it("returns the current provider/model", () => {
    const result = resolveActiveErrorContext({
      provider: "mistral",
      model: "mistral-large-latest",
    });
    expect(result).toEqual({ provider: "mistral", model: "mistral-large-latest" });
  });

  it("prefers assistant provider/model when the failing attempt reports them", () => {
    const result = resolveActiveErrorContext({
      provider: "openai",
      model: "gpt-5.4",
      assistant: {
        provider: "openai",
        model: "gpt-5.4-codex",
      },
    });

    expect(result).toEqual({ provider: "openai", model: "gpt-5.4-codex" });
  });
});
