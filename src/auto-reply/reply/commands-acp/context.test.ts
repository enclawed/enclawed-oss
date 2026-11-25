import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EnclawedConfig } from "../../../config/config.js";
import { __testing as sessionBindingTesting } from "../../../infra/outbound/session-binding-service.js";
import { setActivePluginRegistry } from "../../../plugins/runtime.js";
import {
  createChannelTestPluginBase,
  createTestRegistry,
} from "../../../test-utils/channel-plugins.js";
import { buildCommandTestParams } from "../commands-spawn.test-harness.js";
import {
  resolveAcpCommandBindingContext,
  resolveAcpCommandConversationId,
  resolveAcpCommandParentConversationId,
} from "./context.js";

const baseCfg = {
  session: { mainKey: "main", scope: "per-sender" },
} satisfies EnclawedConfig;

function parseTelegramChatIdForTest(raw?: string | null): string | undefined {
  const trimmed = raw?.trim().replace(/^telegram:/i, "");
  if (!trimmed) {
    return undefined;
  }
  const topicMatch = /^(.*):topic:\d+$/i.exec(trimmed);
  return (topicMatch?.[1] ?? trimmed).trim() || undefined;
}

function parseDiscordConversationIdForTest(
  targets: Array<string | undefined | null>,
): string | undefined {
  for (const rawTarget of targets) {
    const target = rawTarget?.trim();
    if (!target) {
      continue;
    }
    const mentionMatch = /^<#(\d+)>$/.exec(target);
    if (mentionMatch?.[1]) {
      return mentionMatch[1];
    }
    if (/^channel:/i.test(target)) {
      return target;
    }
  }
  return undefined;
}

function parseDiscordParentChannelFromSessionKeyForTest(raw?: string | null): string | undefined {
  const sessionKey = raw?.trim().toLowerCase() ?? "";
  const match = sessionKey.match(/(?:^|:)channel:([^:]+)$/);
  return match?.[1] ? `channel:${match[1]}` : undefined;
}

function parseBlueBubblesConversationIdFromTargetForTest(raw?: string | null): string | undefined {
  const trimmed = raw?.trim().replace(/^bluebubbles:/i, "");
  if (!trimmed) {
    return undefined;
  }
  const prefixed = /^(chat_guid|chat_identifier|chat_id):(.+)$/i.exec(trimmed);
  return (prefixed?.[2] ?? trimmed).trim() || undefined;
}

function parseIMessageConversationIdFromTargetForTest(raw?: string | null): string | undefined {
  const trimmed = raw?.trim().replace(/^imessage:/i, "");
  if (!trimmed) {
    return undefined;
  }
  const prefixed = /^(chat_guid|chat_identifier|chat_id):(.+)$/i.exec(trimmed);
  return (prefixed?.[2] ?? trimmed).trim() || undefined;
}

function parseLineConversationIdFromTargetForTest(raw?: string | null): string | undefined {
  const trimmed = raw?.trim().replace(/^line:/i, "");
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/^user:/i, "").trim() || undefined;
}

function setMinimalAcpContextRegistryForTests(): void {
  setActivePluginRegistry(
    createTestRegistry([
      {
        pluginId: "telegram",
        source: "test",
        plugin: {
          ...createChannelTestPluginBase({ id: "telegram", label: "Telegram" }),
          bindings: {
            resolveCommandConversation: ({
              threadId,
              originatingTo,
              commandTo,
              fallbackTo,
            }: {
              threadId?: string;
              originatingTo?: string;
              commandTo?: string;
              fallbackTo?: string;
            }) => {
              const chatId = [originatingTo, commandTo, fallbackTo]
                .map((candidate) => parseTelegramChatIdForTest(candidate))
                .find(Boolean);
              if (!chatId) {
                return null;
              }
              if (threadId) {
                return {
                  conversationId: `${chatId}:topic:${threadId}`,
                  parentConversationId: chatId,
                };
              }
              if (chatId.startsWith("-")) {
                return null;
              }
              return { conversationId: chatId, parentConversationId: chatId };
            },
          },
        },
      },
      {
        pluginId: "discord",
        source: "test",
        plugin: {
          ...createChannelTestPluginBase({ id: "discord", label: "Discord" }),
          bindings: {
            resolveCommandConversation: ({
              threadId,
              threadParentId,
              parentSessionKey,
              from,
              chatType,
              originatingTo,
              commandTo,
              fallbackTo,
            }: {
              threadId?: string;
              threadParentId?: string;
              parentSessionKey?: string;
              from?: string;
              chatType?: string;
              originatingTo?: string;
              commandTo?: string;
              fallbackTo?: string;
            }) => {
              if (threadId) {
                const parentConversationId =
                  (threadParentId?.trim()
                    ? `channel:${threadParentId.trim().replace(/^channel:/i, "")}`
                    : undefined) ??
                  parseDiscordParentChannelFromSessionKeyForTest(parentSessionKey) ??
                  parseDiscordConversationIdForTest([originatingTo, commandTo, fallbackTo]);
                return {
                  conversationId: threadId,
                  ...(parentConversationId && parentConversationId !== threadId
                    ? { parentConversationId }
                    : {}),
                };
              }
              if (chatType === "direct") {
                const directSenderId = from
                  ?.trim()
                  .replace(/^discord:/i, "")
                  .replace(/^user:/i, "");
                if (directSenderId) {
                  return { conversationId: `user:${directSenderId}` };
                }
              }
              const conversationId = parseDiscordConversationIdForTest([
                originatingTo,
                commandTo,
                fallbackTo,
              ]);
              return conversationId ? { conversationId } : null;
            },
          },
        },
      },
      {
        pluginId: "bluebubbles",
        source: "test",
        plugin: {
          ...createChannelTestPluginBase({ id: "bluebubbles", label: "BlueBubbles" }),
          bindings: {
            resolveCommandConversation: ({
              originatingTo,
              commandTo,
              fallbackTo,
            }: {
              originatingTo?: string;
              commandTo?: string;
              fallbackTo?: string;
            }) => {
              const conversationId =
                parseBlueBubblesConversationIdFromTargetForTest(originatingTo) ??
                parseBlueBubblesConversationIdFromTargetForTest(commandTo) ??
                parseBlueBubblesConversationIdFromTargetForTest(fallbackTo);
              return conversationId ? { conversationId } : null;
            },
          },
        },
      },
      {
        pluginId: "imessage",
        source: "test",
        plugin: {
          ...createChannelTestPluginBase({ id: "imessage", label: "iMessage" }),
          bindings: {
            resolveCommandConversation: ({
              originatingTo,
              commandTo,
              fallbackTo,
            }: {
              originatingTo?: string;
              commandTo?: string;
              fallbackTo?: string;
            }) => {
              const conversationId =
                parseIMessageConversationIdFromTargetForTest(originatingTo) ??
                parseIMessageConversationIdFromTargetForTest(commandTo) ??
                parseIMessageConversationIdFromTargetForTest(fallbackTo);
              return conversationId ? { conversationId } : null;
            },
          },
        },
      },
      {
        pluginId: "line",
        source: "test",
        plugin: {
          ...createChannelTestPluginBase({ id: "line", label: "LINE" }),
          bindings: {
            resolveCommandConversation: ({
              originatingTo,
              commandTo,
              fallbackTo,
            }: {
              originatingTo?: string;
              commandTo?: string;
              fallbackTo?: string;
            }) => {
              const conversationId =
                parseLineConversationIdFromTargetForTest(originatingTo) ??
                parseLineConversationIdFromTargetForTest(commandTo) ??
                parseLineConversationIdFromTargetForTest(fallbackTo);
              return conversationId ? { conversationId } : null;
            },
          },
        },
      },
      {
        pluginId: "matrix",
        source: "test",
        plugin: {
          ...createChannelTestPluginBase({ id: "matrix", label: "Matrix" }),
          bindings: {
            resolveCommandConversation: ({
              threadId,
              originatingTo,
              commandTo,
              fallbackTo,
            }: {
              threadId?: string;
              originatingTo?: string;
              commandTo?: string;
              fallbackTo?: string;
            }) => {
              const roomId = [originatingTo, commandTo, fallbackTo]
                .map((candidate) => candidate?.trim().replace(/^room:/i, ""))
                .find((candidate) => candidate && candidate.length > 0);
              if (!threadId || !roomId) {
                return null;
              }
              return {
                conversationId: threadId,
                parentConversationId: roomId,
              };
            },
          },
        },
      },
    ]),
  );
}

describe("commands-acp context", () => {
  beforeEach(() => {
    setMinimalAcpContextRegistryForTests();
    sessionBindingTesting.resetSessionBindingAdaptersForTests();
  });

  afterEach(() => {
    setMinimalAcpContextRegistryForTests();
  });

  it("resolves channel/account/thread context from originating fields", () => {
    const params = buildCommandTestParams("/acp sessions", baseCfg, {
      Provider: "discord",
      Surface: "discord",
      OriginatingChannel: "discord",
      OriginatingTo: "channel:parent-1",
      AccountId: "work",
      MessageThreadId: "thread-42",
    });

    expect(resolveAcpCommandBindingContext(params)).toEqual({
      channel: "discord",
      accountId: "work",
      threadId: "thread-42",
      conversationId: "thread-42",
      parentConversationId: "channel:parent-1",
    });
  });

  it("resolves discord DM current conversation ids from direct sender context", () => {
    const params = buildCommandTestParams("/acp sessions", baseCfg, {
      Provider: "discord",
      Surface: "discord",
      OriginatingChannel: "discord",
      From: "discord:U1",
      To: "channel:dm-1",
      OriginatingTo: "channel:dm-1",
      ChatType: "direct",
      AccountId: "work",
    });

    expect(resolveAcpCommandBindingContext(params)).toEqual({
      channel: "discord",
      accountId: "work",
      conversationId: "user:U1",
    });
  });

  it("resolves discord thread parent from ParentSessionKey when targets point at the thread", () => {
    const params = buildCommandTestParams("/acp sessions", baseCfg, {
      Provider: "discord",
      Surface: "discord",
      OriginatingChannel: "discord",
      OriginatingTo: "channel:thread-42",
      AccountId: "work",
      MessageThreadId: "thread-42",
      ParentSessionKey: "agent:codex:discord:channel:parent-9",
    });

    expect(resolveAcpCommandBindingContext(params)).toEqual({
      channel: "discord",
      accountId: "work",
      threadId: "thread-42",
      conversationId: "thread-42",
      parentConversationId: "channel:parent-9",
    });
  });

  it("resolves discord thread parent from native context when ParentSessionKey is absent", () => {
    const params = buildCommandTestParams("/acp sessions", baseCfg, {
      Provider: "discord",
      Surface: "discord",
      OriginatingChannel: "discord",
      OriginatingTo: "channel:thread-42",
      AccountId: "work",
      MessageThreadId: "thread-42",
      ThreadParentId: "parent-11",
    });

    expect(resolveAcpCommandBindingContext(params)).toEqual({
      channel: "discord",
      accountId: "work",
      threadId: "thread-42",
      conversationId: "thread-42",
      parentConversationId: "channel:parent-11",
    });
  });

  it("falls back to default account and target-derived conversation id", () => {
    const params = buildCommandTestParams("/acp status", baseCfg, {
      Provider: "slack",
      Surface: "slack",
      OriginatingChannel: "slack",
      To: "<#123456789>",
    });

    expect(resolveAcpCommandBindingContext(params)).toEqual({
      channel: "slack",
      accountId: "default",
      threadId: undefined,
      conversationId: "123456789",
    });
    expect(resolveAcpCommandConversationId(params)).toBe("123456789");
  });

  it("uses the plugin default account when ACP context omits AccountId", () => {
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "line",
          source: "test",
          plugin: {
            ...createChannelTestPluginBase({
              id: "line",
              label: "LINE",
              config: {
                listAccountIds: () => ["default", "work"],
                defaultAccountId: () => "work",
              },
            }),
            bindings: {
              resolveCommandConversation: ({
                originatingTo,
                commandTo,
                fallbackTo,
              }: {
                originatingTo?: string;
                commandTo?: string;
                fallbackTo?: string;
              }) => {
                const conversationId =
                  parseLineConversationIdFromTargetForTest(originatingTo) ??
                  parseLineConversationIdFromTargetForTest(commandTo) ??
                  parseLineConversationIdFromTargetForTest(fallbackTo);
                return conversationId ? { conversationId } : null;
              },
            },
          },
        },
      ]),
    );

    const params = buildCommandTestParams("/acp status", baseCfg, {
      Provider: "line",
      Surface: "line",
      OriginatingChannel: "line",
      OriginatingTo: "line:user:U1234567890abcdef1234567890abcdef",
    });

    expect(resolveAcpCommandBindingContext(params)).toEqual({
      channel: "line",
      accountId: "work",
      threadId: undefined,
      conversationId: "U1234567890abcdef1234567890abcdef",
    });
  });

  it("builds canonical telegram topic conversation ids from originating chat + thread", () => {
    const params = buildCommandTestParams("/acp status", baseCfg, {
      Provider: "telegram",
      Surface: "telegram",
      OriginatingChannel: "telegram",
      OriginatingTo: "telegram:-1001234567890",
      MessageThreadId: "42",
    });

    expect(resolveAcpCommandBindingContext(params)).toEqual({
      channel: "telegram",
      accountId: "default",
      threadId: "42",
      conversationId: "-1001234567890:topic:42",
      parentConversationId: "-1001234567890",
    });
    expect(resolveAcpCommandConversationId(params)).toBe("-1001234567890:topic:42");
  });

  it("resolves Telegram DM conversation ids from telegram targets", () => {
    const params = buildCommandTestParams("/acp status", baseCfg, {
      Provider: "telegram",
      Surface: "telegram",
      OriginatingChannel: "telegram",
      OriginatingTo: "telegram:123456789",
    });

    expect(resolveAcpCommandBindingContext(params)).toEqual({
      channel: "telegram",
      accountId: "default",
      threadId: undefined,
      conversationId: "123456789",
    });
    expect(resolveAcpCommandConversationId(params)).toBe("123456789");
  });

  it("resolves LINE DM conversation ids from raw LINE targets", () => {
    const params = buildCommandTestParams("/acp status", baseCfg, {
      Provider: "line",
      Surface: "line",
      OriginatingChannel: "line",
      OriginatingTo: "U1234567890abcdef1234567890abcdef",
    });

    expect(resolveAcpCommandBindingContext(params)).toEqual({
      channel: "line",
      accountId: "default",
      threadId: undefined,
      conversationId: "U1234567890abcdef1234567890abcdef",
    });
    expect(resolveAcpCommandConversationId(params)).toBe("U1234567890abcdef1234567890abcdef");
  });

  it("resolves LINE conversation ids from prefixed LINE targets", () => {
    const params = buildCommandTestParams("/acp status", baseCfg, {
      Provider: "line",
      Surface: "line",
      OriginatingChannel: "line",
      OriginatingTo: "line:user:U1234567890abcdef1234567890abcdef",
      AccountId: "work",
    });

    expect(resolveAcpCommandBindingContext(params)).toEqual({
      channel: "line",
      accountId: "work",
      threadId: undefined,
      conversationId: "U1234567890abcdef1234567890abcdef",
    });
  });

  it("resolves LINE conversation ids from canonical line targets", () => {
    const params = buildCommandTestParams("/acp status", baseCfg, {
      Provider: "line",
      Surface: "line",
      OriginatingChannel: "line",
      OriginatingTo: "line:U1234567890abcdef1234567890abcdef",
      AccountId: "work",
    });

    expect(resolveAcpCommandBindingContext(params)).toEqual({
      channel: "line",
      accountId: "work",
      threadId: undefined,
      conversationId: "U1234567890abcdef1234567890abcdef",
    });
    expect(resolveAcpCommandConversationId(params)).toBe("U1234567890abcdef1234567890abcdef");
  });

  it("resolves Matrix thread context from the current room and thread root", () => {
    const params = buildCommandTestParams("/acp status", baseCfg, {
      Provider: "matrix",
      Surface: "matrix",
      OriginatingChannel: "matrix",
      OriginatingTo: "room:!room:example.org",
      AccountId: "work",
      MessageThreadId: "$thread-root",
    });

    expect(resolveAcpCommandBindingContext(params)).toEqual({
      channel: "matrix",
      accountId: "work",
      threadId: "$thread-root",
      conversationId: "$thread-root",
      parentConversationId: "!room:example.org",
    });
    expect(resolveAcpCommandConversationId(params)).toBe("$thread-root");
    expect(resolveAcpCommandParentConversationId(params)).toBe("!room:example.org");
  });

  it("resolves BlueBubbles DM conversation ids from current targets", () => {
    const params = buildCommandTestParams("/acp status", baseCfg, {
      Provider: "bluebubbles",
      Surface: "bluebubbles",
      OriginatingChannel: "bluebubbles",
      OriginatingTo: "bluebubbles:+15555550123",
    });

    expect(resolveAcpCommandBindingContext(params)).toEqual({
      channel: "bluebubbles",
      accountId: "default",
      threadId: undefined,
      conversationId: "+15555550123",
      parentConversationId: undefined,
    });
    expect(resolveAcpCommandConversationId(params)).toBe("+15555550123");
  });

  it("resolves BlueBubbles group conversation ids from explicit chat targets", () => {
    const params = buildCommandTestParams("/acp status", baseCfg, {
      Provider: "bluebubbles",
      Surface: "bluebubbles",
      OriginatingChannel: "bluebubbles",
      OriginatingTo: "bluebubbles:chat_guid:iMessage;+;chat123",
      AccountId: "work",
    });

    expect(resolveAcpCommandBindingContext(params)).toEqual({
      channel: "bluebubbles",
      accountId: "work",
      threadId: undefined,
      conversationId: "iMessage;+;chat123",
      parentConversationId: undefined,
    });
    expect(resolveAcpCommandConversationId(params)).toBe("iMessage;+;chat123");
  });

  it("resolves iMessage DM conversation ids from current targets", () => {
    const params = buildCommandTestParams("/acp status", baseCfg, {
      Provider: "imessage",
      Surface: "imessage",
      OriginatingChannel: "imessage",
      OriginatingTo: "imessage:+15555550123",
    });

    expect(resolveAcpCommandBindingContext(params)).toEqual({
      channel: "imessage",
      accountId: "default",
      threadId: undefined,
      conversationId: "+15555550123",
      parentConversationId: undefined,
    });
    expect(resolveAcpCommandConversationId(params)).toBe("+15555550123");
  });

  it("resolves iMessage group conversation ids from chat_id targets", () => {
    const params = buildCommandTestParams("/acp status", baseCfg, {
      Provider: "imessage",
      Surface: "imessage",
      OriginatingChannel: "imessage",
      OriginatingTo: "chat_id:12345",
      AccountId: "work",
    });

    expect(resolveAcpCommandBindingContext(params)).toEqual({
      channel: "imessage",
      accountId: "work",
      threadId: undefined,
      conversationId: "12345",
      parentConversationId: undefined,
    });
    expect(resolveAcpCommandConversationId(params)).toBe("12345");
  });
});
