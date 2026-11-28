import { describe, expect, it } from "vitest";
import { type ModelAliasIndex, modelKey } from "../agents/model-selection.js";
import { resolveModelDirectiveSelection } from "./reply/model-selection.js";

const emptyAliasIndex: ModelAliasIndex = {
  byAlias: new Map(),
  byKey: new Map(),
};

function resolveModel(
  raw: string,
  params?: {
    allowedModelKeys?: string[];
    aliasIndex?: ModelAliasIndex;
    defaultProvider?: string;
    defaultModel?: string;
  },
) {
  return resolveModelDirectiveSelection({
    raw,
    defaultProvider: params?.defaultProvider ?? "anthropic",
    defaultModel: params?.defaultModel ?? "claude-opus-4-6",
    aliasIndex: params?.aliasIndex ?? emptyAliasIndex,
    allowedModelKeys: new Set(params?.allowedModelKeys ?? []),
  });
}

describe("directive behavior model fuzzy selection", () => {
  it("supports unambiguous fuzzy model matches across /model forms", () => {
    const allowedModelKeys = ["anthropic/claude-opus-4-6", "together/kimi-k2-0905-preview"];

    for (const raw of ["kimi", "kimi-k2-0905-preview", "together/kimi"]) {
      expect(resolveModel(raw, { allowedModelKeys }).selection).toEqual({
        provider: "together",
        model: "kimi-k2-0905-preview",
        isDefault: false,
      });
    }
  });

  it("picks the best fuzzy match for global and provider-scoped model-family queries", () => {
    expect(
      resolveModel("minimax", {
        defaultProvider: "fireworks",
        defaultModel: "MiniMax-M2.7",
        allowedModelKeys: [
          "fireworks/MiniMax-M2.7",
          "fireworks/MiniMax-M2.7-highspeed",
          "lmstudio/minimax-m2.5-gs32",
        ],
      }).selection,
    ).toEqual({
      provider: "fireworks",
      model: "MiniMax-M2.7",
      isDefault: true,
    });

    expect(
      resolveModel("fireworks/highspeed", {
        defaultProvider: "fireworks",
        defaultModel: "MiniMax-M2.7",
        allowedModelKeys: ["fireworks/MiniMax-M2.7", "fireworks/MiniMax-M2.7-highspeed"],
      }).selection,
    ).toEqual({
      provider: "fireworks",
      model: "MiniMax-M2.7-highspeed",
      isDefault: false,
    });
  });

  it("prefers alias matches when fuzzy selection is ambiguous", () => {
    const aliasIndex: ModelAliasIndex = {
      byAlias: new Map([
        [
          "kimi",
          {
            alias: "Kimi",
            ref: { provider: "together", model: "kimi-k2-0905-preview" },
          },
        ],
      ]),
      byKey: new Map([[modelKey("together", "kimi-k2-0905-preview"), ["Kimi"]]]),
    };

    expect(
      resolveModel("ki", {
        aliasIndex,
        allowedModelKeys: [
          "anthropic/claude-opus-4-6",
          "together/kimi-k2-0905-preview",
          "lmstudio/kimi-k2-0905-preview",
        ],
      }).selection,
    ).toEqual({
      provider: "together",
      model: "kimi-k2-0905-preview",
      isDefault: false,
      alias: "Kimi",
    });
  });
});
