import { describe, expect, it } from "vitest";
import {
  buildModelPickerItems,
  resolveProviderEndpointLabel,
} from "./directive-handling.model-picker.js";

describe("directive-handling.model-picker", () => {
  it("dedupes provider aliases when building picker items", () => {
    expect(
      buildModelPickerItems([
        { provider: "bedrock", id: "claude-sonnet-4-6" },
        { provider: "aws-bedrock", id: "claude-sonnet-4-6" },
      ]),
    ).toEqual([{ provider: "amazon-bedrock", model: "claude-sonnet-4-6" }]);
  });

  it("matches provider endpoint labels across canonical aliases", () => {
    const result = resolveProviderEndpointLabel("aws-bedrock", {
      models: {
        providers: {
          bedrock: {
            baseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com",
            api: "responses",
          },
        },
      },
    } as never);

    expect(result).toEqual({
      endpoint: "https://bedrock-runtime.us-east-1.amazonaws.com",
      api: "responses",
    });
  });
});
