import { describe, expect, it } from "vitest";
import type { EnclawedConfig } from "../../config/config.js";
import {
  createScopedAccountReplyToModeResolver,
  createStaticReplyToModeResolver,
  createTopLevelChannelReplyToModeResolver,
} from "./threading-helpers.js";

describe("createStaticReplyToModeResolver", () => {
  it.each(["off", "all"] as const)("always returns the configured mode %s", (mode) => {
    expect(createStaticReplyToModeResolver(mode)({ cfg: {} as EnclawedConfig })).toBe(mode);
  });
});

describe("createTopLevelChannelReplyToModeResolver", () => {
  const resolver = createTopLevelChannelReplyToModeResolver("demo-top-level");

  it.each([
    {
      name: "reads the top-level channel config",
      cfg: { channels: { "demo-top-level": { replyToMode: "first" } } } as EnclawedConfig,
      expected: "first",
    },
    {
      name: "falls back to off",
      cfg: {} as EnclawedConfig,
      expected: "off",
    },
  ])("$name", ({ cfg, expected }) => {
    expect(resolver({ cfg })).toBe(expected);
  });
});

describe("createScopedAccountReplyToModeResolver", () => {
  function createScopedResolver() {
    return createScopedAccountReplyToModeResolver({
      resolveAccount: (cfg, accountId) =>
        ((
          cfg.channels as {
            demo?: {
              accounts?: Record<string, { replyToMode?: "off" | "first" | "all" | "batched" }>;
            };
          }
        ).demo?.accounts?.[accountId?.toLowerCase() ?? "default"] ?? {}) as {
          replyToMode?: "off" | "first" | "all" | "batched";
        },
      resolveReplyToMode: (account) => account.replyToMode,
    });
  }

  it.each([
    { accountId: "assistant", expected: "all" },
    { accountId: "default", expected: "off" },
  ] as const)("resolves scoped reply mode for $accountId", ({ accountId, expected }) => {
    const resolver = createScopedResolver();
    const cfg = {
      channels: {
        demo: {
          accounts: {
            assistant: { replyToMode: "all" },
          },
        },
      },
    } as EnclawedConfig;

    expect(resolver({ cfg, accountId })).toBe(expected);
  });

  it("passes chatType through", () => {
    const seen: Array<string | null | undefined> = [];
    const resolver = createScopedAccountReplyToModeResolver({
      resolveAccount: () => ({ replyToMode: "first" as const }),
      resolveReplyToMode: (account, chatType) => {
        seen.push(chatType);
        return account.replyToMode;
      },
    });

    expect(resolver({ cfg: {} as EnclawedConfig, chatType: "group" })).toBe("first");
    expect(seen).toEqual(["group"]);
  });
});
