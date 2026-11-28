import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAgentWorkspaceDir } from "../agents/agent-scope.js";
import type { ChannelConfiguredBindingProvider, ChannelPlugin } from "../channels/plugins/types.js";
import type { EnclawedConfig } from "../config/config.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";
import { createChannelTestPluginBase, createTestRegistry } from "../test-utils/channel-plugins.js";
import { buildConfiguredAcpSessionKey } from "./persistent-bindings.types.js";
const managerMocks = vi.hoisted(() => ({
  resolveSession: vi.fn(),
  closeSession: vi.fn(),
  initializeSession: vi.fn(),
  updateSessionRuntimeOptions: vi.fn(),
}));
const sessionMetaMocks = vi.hoisted(() => ({
  readAcpSessionEntry: vi.fn(),
}));

vi.mock("./control-plane/manager.js", () => ({
  getAcpSessionManager: () => ({
    resolveSession: managerMocks.resolveSession,
    closeSession: managerMocks.closeSession,
    initializeSession: managerMocks.initializeSession,
    updateSessionRuntimeOptions: managerMocks.updateSessionRuntimeOptions,
  }),
}));
vi.mock("./runtime/session-meta.js", () => ({
  readAcpSessionEntry: sessionMetaMocks.readAcpSessionEntry,
}));

type PersistentBindingsModule = Pick<
  typeof import("./persistent-bindings.resolve.js"),
  "resolveConfiguredAcpBindingRecord" | "resolveConfiguredAcpBindingSpecBySessionKey"
> &
  Pick<
    typeof import("./persistent-bindings.lifecycle.js"),
    "ensureConfiguredAcpBindingSession" | "resetAcpSessionInPlace"
  >;
let persistentBindings: PersistentBindingsModule;
let lifecycleBindingsModule: Pick<
  typeof import("./persistent-bindings.lifecycle.js"),
  "ensureConfiguredAcpBindingSession" | "resetAcpSessionInPlace"
>;
let persistentBindingsResolveModule: Pick<
  typeof import("./persistent-bindings.resolve.js"),
  "resolveConfiguredAcpBindingRecord" | "resolveConfiguredAcpBindingSpecBySessionKey"
>;

type ConfiguredBinding = NonNullable<EnclawedConfig["bindings"]>[number];
type BindingRecordInput = Parameters<
  PersistentBindingsModule["resolveConfiguredAcpBindingRecord"]
>[0];
type BindingSpec = Parameters<
  PersistentBindingsModule["ensureConfiguredAcpBindingSession"]
>[0]["spec"];

const baseCfg = {
  session: { mainKey: "main", scope: "per-sender" },
  agents: {
    list: [{ id: "codex" }, { id: "claude" }],
  },
} satisfies EnclawedConfig;

const defaultDiscordConversationId = "1478836151241412759";
const defaultDiscordAccountId = "default";

const discordBindings: ChannelConfiguredBindingProvider = {
  compileConfiguredBinding: ({ conversationId }) => {
    const normalized = conversationId.trim();
    return normalized ? { conversationId: normalized } : null;
  },
  matchInboundConversation: ({ compiledBinding, conversationId, parentConversationId }) => {
    if (compiledBinding.conversationId === conversationId) {
      return { conversationId, matchPriority: 2 };
    }
    if (
      parentConversationId &&
      parentConversationId !== conversationId &&
      compiledBinding.conversationId === parentConversationId
    ) {
      return { conversationId: parentConversationId, matchPriority: 1 };
    }
    return null;
  },
};

function parseTelegramTopicConversationForTest(params: {
  conversationId: string;
  parentConversationId?: string;
}): {
  canonicalConversationId: string;
  chatId: string;
  topicId?: string;
} | null {
  const conversationId = params.conversationId.trim();
  const parentConversationId = params.parentConversationId?.trim() || undefined;
  if (!conversationId) {
    return null;
  }
  const canonicalTopicMatch = /^(-[^:]+):topic:([^:]+)$/.exec(conversationId);
  if (canonicalTopicMatch) {
    const [, chatId, topicId] = canonicalTopicMatch;
    return {
      canonicalConversationId: `${chatId}:topic:${topicId}`,
      chatId,
      topicId,
    };
  }
  if (parentConversationId) {
    return {
      canonicalConversationId: `${parentConversationId}:topic:${conversationId}`,
      chatId: parentConversationId,
      topicId: conversationId,
    };
  }
  return {
    canonicalConversationId: conversationId,
    chatId: conversationId,
  };
}

const telegramBindings: ChannelConfiguredBindingProvider = {
  compileConfiguredBinding: ({ conversationId }) => {
    const parsed = parseTelegramTopicConversationForTest({ conversationId });
    if (!parsed || !parsed.chatId.startsWith("-")) {
      return null;
    }
    return {
      conversationId: parsed.canonicalConversationId,
      parentConversationId: parsed.chatId,
    };
  },
  matchInboundConversation: ({ compiledBinding, conversationId, parentConversationId }) => {
    const incoming = parseTelegramTopicConversationForTest({
      conversationId,
      parentConversationId,
    });
    if (!incoming || !incoming.chatId.startsWith("-")) {
      return null;
    }
    if (compiledBinding.conversationId !== incoming.canonicalConversationId) {
      return null;
    }
    return {
      conversationId: incoming.canonicalConversationId,
      parentConversationId: incoming.chatId,
      matchPriority: 2,
    };
  },
};

function createConfiguredBindingTestPlugin(
  id: ChannelPlugin["id"],
  bindings: ChannelConfiguredBindingProvider,
): Pick<ChannelPlugin, "id" | "meta" | "capabilities" | "config" | "bindings"> {
  return {
    ...createChannelTestPluginBase({ id }),
    bindings,
  };
}

function createCfgWithBindings(
  bindings: ConfiguredBinding[],
  overrides?: Partial<EnclawedConfig>,
): EnclawedConfig {
  return {
    ...baseCfg,
    ...overrides,
    bindings,
  } as EnclawedConfig;
}

function createDiscordBinding(params: {
  agentId: string;
  conversationId: string;
  accountId?: string;
  acp?: Record<string, unknown>;
}): ConfiguredBinding {
  return {
    type: "acp",
    agentId: params.agentId,
    match: {
      channel: "discord",
      accountId: params.accountId ?? defaultDiscordAccountId,
      peer: { kind: "channel", id: params.conversationId },
    },
    ...(params.acp ? { acp: params.acp } : {}),
  } as ConfiguredBinding;
}

function createTelegramGroupBinding(params: {
  agentId: string;
  conversationId: string;
  acp?: Record<string, unknown>;
}): ConfiguredBinding {
  return {
    type: "acp",
    agentId: params.agentId,
    match: {
      channel: "telegram",
      accountId: defaultDiscordAccountId,
      peer: { kind: "group", id: params.conversationId },
    },
    ...(params.acp ? { acp: params.acp } : {}),
  } as ConfiguredBinding;
}

function resolveBindingRecord(cfg: EnclawedConfig, overrides: Partial<BindingRecordInput> = {}) {
  return persistentBindings.resolveConfiguredAcpBindingRecord({
    cfg,
    channel: "discord",
    accountId: defaultDiscordAccountId,
    conversationId: defaultDiscordConversationId,
    ...overrides,
  });
}

function resolveDiscordBindingSpecBySession(
  cfg: EnclawedConfig,
  conversationId = defaultDiscordConversationId,
) {
  const resolved = resolveBindingRecord(cfg, { conversationId });
  return persistentBindings.resolveConfiguredAcpBindingSpecBySessionKey({
    cfg,
    sessionKey: resolved?.record.targetSessionKey ?? "",
  });
}

function createDiscordPersistentSpec(overrides: Partial<BindingSpec> = {}): BindingSpec {
  return {
    channel: "discord",
    accountId: defaultDiscordAccountId,
    conversationId: defaultDiscordConversationId,
    agentId: "codex",
    mode: "persistent",
    ...overrides,
  } as BindingSpec;
}

function mockReadySession(params: {
  spec: BindingSpec;
  cwd: string;
  state?: "idle" | "running" | "error";
}) {
  const sessionKey = buildConfiguredAcpSessionKey(params.spec);
  managerMocks.resolveSession.mockReturnValue({
    kind: "ready",
    sessionKey,
    meta: {
      backend: "acpx",
      agent: params.spec.acpAgentId ?? params.spec.agentId,
      runtimeSessionName: "existing",
      mode: params.spec.mode,
      runtimeOptions: { cwd: params.cwd },
      state: params.state ?? "idle",
      lastActivityAt: Date.now(),
    },
  });
  return sessionKey;
}

beforeAll(async () => {
  persistentBindingsResolveModule = await import("./persistent-bindings.resolve.js");
  lifecycleBindingsModule = await import("./persistent-bindings.lifecycle.js");
  persistentBindings = {
    resolveConfiguredAcpBindingRecord:
      persistentBindingsResolveModule.resolveConfiguredAcpBindingRecord,
    resolveConfiguredAcpBindingSpecBySessionKey:
      persistentBindingsResolveModule.resolveConfiguredAcpBindingSpecBySessionKey,
    ensureConfiguredAcpBindingSession: lifecycleBindingsModule.ensureConfiguredAcpBindingSession,
    resetAcpSessionInPlace: lifecycleBindingsModule.resetAcpSessionInPlace,
  };
});

beforeEach(() => {
  setActivePluginRegistry(
    createTestRegistry([
      {
        pluginId: "discord",
        plugin: createConfiguredBindingTestPlugin("discord", discordBindings),
        source: "test",
      },
      {
        pluginId: "telegram",
        plugin: createConfiguredBindingTestPlugin("telegram", telegramBindings),
        source: "test",
      },
    ]),
  );
  managerMocks.resolveSession.mockReset();
  managerMocks.resolveSession.mockReturnValue({ kind: "none" });
  managerMocks.closeSession.mockReset().mockResolvedValue({
    runtimeClosed: true,
    metaCleared: true,
  });
  managerMocks.initializeSession.mockReset().mockResolvedValue(undefined);
  managerMocks.updateSessionRuntimeOptions.mockReset().mockResolvedValue(undefined);
  sessionMetaMocks.readAcpSessionEntry.mockReset().mockReturnValue(undefined);
});

describe("resolveConfiguredAcpBindingRecord", () => {
  it("resolves discord channel ACP binding from top-level typed bindings", () => {
    const cfg = createCfgWithBindings([
      createDiscordBinding({
        agentId: "codex",
        conversationId: defaultDiscordConversationId,
        acp: { cwd: "/repo/enclawed" },
      }),
    ]);
    const resolved = resolveBindingRecord(cfg);

    expect(resolved?.spec.channel).toBe("discord");
    expect(resolved?.spec.conversationId).toBe(defaultDiscordConversationId);
    expect(resolved?.spec.agentId).toBe("codex");
    expect(resolved?.record.targetSessionKey).toContain("agent:codex:acp:binding:discord:default:");
    expect(resolved?.record.metadata?.source).toBe("config");
  });

  it("falls back to parent discord channel when conversation is a thread id", () => {
    const cfg = createCfgWithBindings([
      createDiscordBinding({
        agentId: "codex",
        conversationId: "channel-parent-1",
      }),
    ]);
    const resolved = resolveBindingRecord(cfg, {
      conversationId: "thread-123",
      parentConversationId: "channel-parent-1",
    });

    expect(resolved?.spec.conversationId).toBe("channel-parent-1");
    expect(resolved?.record.conversation.conversationId).toBe("channel-parent-1");
  });

  it("prefers direct discord thread binding over parent channel fallback", () => {
    const cfg = createCfgWithBindings([
      createDiscordBinding({
        agentId: "codex",
        conversationId: "channel-parent-1",
      }),
      createDiscordBinding({
        agentId: "claude",
        conversationId: "thread-123",
      }),
    ]);
    const resolved = resolveBindingRecord(cfg, {
      conversationId: "thread-123",
      parentConversationId: "channel-parent-1",
    });

    expect(resolved?.spec.conversationId).toBe("thread-123");
    expect(resolved?.spec.agentId).toBe("claude");
  });

  it("prefers exact account binding over wildcard for the same discord conversation", () => {
    const cfg = createCfgWithBindings([
      createDiscordBinding({
        agentId: "codex",
        conversationId: defaultDiscordConversationId,
        accountId: "*",
      }),
      createDiscordBinding({
        agentId: "claude",
        conversationId: defaultDiscordConversationId,
      }),
    ]);
    const resolved = resolveBindingRecord(cfg);

    expect(resolved?.spec.agentId).toBe("claude");
  });

  it("returns null when no top-level ACP binding matches the conversation", () => {
    const cfg = createCfgWithBindings([
      createDiscordBinding({
        agentId: "codex",
        conversationId: "different-channel",
      }),
    ]);
    const resolved = resolveBindingRecord(cfg, {
      conversationId: "thread-123",
      parentConversationId: "channel-parent-1",
    });

    expect(resolved).toBeNull();
  });

  it("resolves telegram forum topic bindings using canonical conversation ids", () => {
    const cfg = createCfgWithBindings([
      createTelegramGroupBinding({
        agentId: "claude",
        conversationId: "-1001234567890:topic:42",
        acp: { backend: "acpx" },
      }),
    ]);

    const canonical = persistentBindings.resolveConfiguredAcpBindingRecord({
      cfg,
      channel: "telegram",
      accountId: "default",
      conversationId: "-1001234567890:topic:42",
    });
    const splitIds = persistentBindings.resolveConfiguredAcpBindingRecord({
      cfg,
      channel: "telegram",
      accountId: "default",
      conversationId: "42",
      parentConversationId: "-1001234567890",
    });

    expect(canonical?.spec.conversationId).toBe("-1001234567890:topic:42");
    expect(splitIds?.spec.conversationId).toBe("-1001234567890:topic:42");
    expect(canonical?.spec.agentId).toBe("claude");
    expect(canonical?.spec.backend).toBe("acpx");
    expect(splitIds?.record.targetSessionKey).toBe(canonical?.record.targetSessionKey);
  });

  it("skips telegram non-group topic configs", () => {
    const cfg = createCfgWithBindings([
      createTelegramGroupBinding({
        agentId: "claude",
        conversationId: "123456789:topic:42",
      }),
    ]);

    const resolved = persistentBindings.resolveConfiguredAcpBindingRecord({
      cfg,
      channel: "telegram",
      accountId: "default",
      conversationId: "123456789:topic:42",
    });
    expect(resolved).toBeNull();
  });

  it("applies agent runtime ACP defaults for bound conversations", () => {
    const cfg = createCfgWithBindings(
      [
        createDiscordBinding({
          agentId: "coding",
          conversationId: defaultDiscordConversationId,
        }),
      ],
      {
        agents: {
          list: [
            { id: "main" },
            {
              id: "coding",
              runtime: {
                type: "acp",
                acp: {
                  agent: "codex",
                  backend: "acpx",
                  mode: "oneshot",
                  cwd: "/workspace/repo-a",
                },
              },
            },
          ],
        },
      },
    );
    const resolved = resolveBindingRecord(cfg);

    expect(resolved?.spec.agentId).toBe("coding");
    expect(resolved?.spec.acpAgentId).toBe("codex");
    expect(resolved?.spec.mode).toBe("oneshot");
    expect(resolved?.spec.cwd).toBe("/workspace/repo-a");
    expect(resolved?.spec.backend).toBe("acpx");
  });

  it("derives configured binding cwd from an explicit agent workspace", () => {
    const cfg = createCfgWithBindings(
      [
        createDiscordBinding({
          agentId: "codex",
          conversationId: defaultDiscordConversationId,
        }),
      ],
      {
        agents: {
          list: [{ id: "codex", workspace: "/workspace/enclawed" }, { id: "claude" }],
        },
      },
    );
    const resolved = resolveBindingRecord(cfg);

    expect(resolved?.spec.cwd).toBe(resolveAgentWorkspaceDir(cfg, "codex"));
  });
});

describe("resolveConfiguredAcpBindingSpecBySessionKey", () => {
  it("maps a configured discord binding session key back to its spec", () => {
    const cfg = createCfgWithBindings([
      createDiscordBinding({
        agentId: "codex",
        conversationId: defaultDiscordConversationId,
        acp: { backend: "acpx" },
      }),
    ]);
    const spec = resolveDiscordBindingSpecBySession(cfg);

    expect(spec?.channel).toBe("discord");
    expect(spec?.conversationId).toBe(defaultDiscordConversationId);
    expect(spec?.agentId).toBe("codex");
    expect(spec?.backend).toBe("acpx");
  });

  it("returns null for unknown session keys", () => {
    const spec = persistentBindings.resolveConfiguredAcpBindingSpecBySessionKey({
      cfg: baseCfg,
      sessionKey: "agent:main:acp:binding:discord:default:notfound",
    });
    expect(spec).toBeNull();
  });

  it("prefers exact account ACP settings over wildcard when session keys collide", () => {
    const cfg = createCfgWithBindings([
      createDiscordBinding({
        agentId: "codex",
        conversationId: defaultDiscordConversationId,
        accountId: "*",
        acp: { backend: "wild" },
      }),
      createDiscordBinding({
        agentId: "codex",
        conversationId: defaultDiscordConversationId,
        acp: { backend: "exact" },
      }),
    ]);
    const spec = resolveDiscordBindingSpecBySession(cfg);

    expect(spec?.backend).toBe("exact");
  });
});

describe("buildConfiguredAcpSessionKey", () => {
  it("is deterministic for the same conversation binding", () => {
    const sessionKeyA = buildConfiguredAcpSessionKey({
      channel: "discord",
      accountId: "default",
      conversationId: "1478836151241412759",
      agentId: "codex",
      mode: "persistent",
    });
    const sessionKeyB = buildConfiguredAcpSessionKey({
      channel: "discord",
      accountId: "default",
      conversationId: "1478836151241412759",
      agentId: "codex",
      mode: "persistent",
    });
    expect(sessionKeyA).toBe(sessionKeyB);
  });
});

describe("ensureConfiguredAcpBindingSession", () => {
  it("keeps an existing ready session when configured binding omits cwd", async () => {
    const spec = createDiscordPersistentSpec();
    const sessionKey = mockReadySession({
      spec,
      cwd: "/workspace/enclawed",
    });

    const ensured = await persistentBindings.ensureConfiguredAcpBindingSession({
      cfg: baseCfg,
      spec,
    });

    expect(ensured).toEqual({ ok: true, sessionKey });
    expect(managerMocks.closeSession).not.toHaveBeenCalled();
    expect(managerMocks.initializeSession).not.toHaveBeenCalled();
  });

  it("reinitializes a ready session when binding config explicitly sets mismatched cwd", async () => {
    const spec = createDiscordPersistentSpec({
      cwd: "/workspace/repo-a",
    });
    const sessionKey = mockReadySession({
      spec,
      cwd: "/workspace/other-repo",
    });

    const ensured = await persistentBindings.ensureConfiguredAcpBindingSession({
      cfg: baseCfg,
      spec,
    });

    expect(ensured).toEqual({ ok: true, sessionKey });
    expect(managerMocks.closeSession).toHaveBeenCalledTimes(1);
    expect(managerMocks.closeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey,
        clearMeta: false,
      }),
    );
    expect(managerMocks.initializeSession).toHaveBeenCalledTimes(1);
  });

  it("reinitializes a matching session when the stored ACP session is in error state", async () => {
    const spec = createDiscordPersistentSpec({
      cwd: "/home/bob/clawd",
    });
    const sessionKey = mockReadySession({
      spec,
      cwd: "/home/bob/clawd",
      state: "error",
    });

    const ensured = await persistentBindings.ensureConfiguredAcpBindingSession({
      cfg: baseCfg,
      spec,
    });

    expect(ensured).toEqual({ ok: true, sessionKey });
    expect(managerMocks.closeSession).toHaveBeenCalledTimes(1);
    expect(managerMocks.initializeSession).toHaveBeenCalledTimes(1);
  });

  it("initializes ACP session with runtime agent override when provided", async () => {
    const spec = createDiscordPersistentSpec({
      agentId: "coding",
      acpAgentId: "codex",
    });
    managerMocks.resolveSession.mockReturnValue({ kind: "none" });

    const ensured = await persistentBindings.ensureConfiguredAcpBindingSession({
      cfg: baseCfg,
      spec,
    });

    expect(ensured.ok).toBe(true);
    expect(managerMocks.initializeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "codex",
      }),
    );
  });
});

describe("resetAcpSessionInPlace", () => {
  it("treats configured bindings without ACP metadata as already reset", async () => {
    const cfg = createCfgWithBindings([
      createDiscordBinding({
        agentId: "claude",
        conversationId: "1478844424791396446",
        acp: {
          mode: "persistent",
          backend: "acpx",
        },
      }),
    ]);
    const sessionKey = buildConfiguredAcpSessionKey({
      channel: "discord",
      accountId: "default",
      conversationId: "1478844424791396446",
      agentId: "claude",
      mode: "persistent",
      backend: "acpx",
    });
    managerMocks.resolveSession.mockReturnValue({ kind: "none" });

    const result = await persistentBindings.resetAcpSessionInPlace({
      cfg,
      sessionKey,
      reason: "new",
    });

    expect(result).toEqual({ ok: true });
    expect(managerMocks.initializeSession).not.toHaveBeenCalled();
  });

  it("clears existing configured ACP sessions and lets the next turn recreate them", async () => {
    const cfg = createCfgWithBindings([
      createDiscordBinding({
        agentId: "claude",
        conversationId: "1478844424791396446",
        acp: {
          mode: "persistent",
          backend: "acpx",
        },
      }),
    ]);
    const sessionKey = buildConfiguredAcpSessionKey({
      channel: "discord",
      accountId: "default",
      conversationId: "1478844424791396446",
      agentId: "claude",
      mode: "persistent",
      backend: "acpx",
    });
    sessionMetaMocks.readAcpSessionEntry.mockReturnValue({
      acp: {
        agent: "claude",
        mode: "persistent",
        backend: "acpx",
        runtimeOptions: { cwd: "/home/bob/clawd" },
      },
    });

    const result = await persistentBindings.resetAcpSessionInPlace({
      cfg,
      sessionKey,
      reason: "reset",
    });

    expect(result).toEqual({ ok: true });
    expect(managerMocks.closeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey,
        clearMeta: true,
      }),
    );
    expect(managerMocks.initializeSession).not.toHaveBeenCalled();
    expect(managerMocks.updateSessionRuntimeOptions).not.toHaveBeenCalled();
  });

  it("recreates the bound session on the next ensure after an in-place reset", async () => {
    const cfg = createCfgWithBindings([
      createDiscordBinding({
        agentId: "claude",
        conversationId: "9373ab192b2317f4",
        acp: {
          backend: "acpx",
        },
      }),
    ]);
    const sessionKey = buildConfiguredAcpSessionKey({
      channel: "discord",
      accountId: "default",
      conversationId: "9373ab192b2317f4",
      agentId: "claude",
      mode: "persistent",
      backend: "acpx",
    });
    sessionMetaMocks.readAcpSessionEntry.mockReturnValue({
      acp: {
        agent: "claude",
        mode: "persistent",
        backend: "acpx",
      },
    });

    const resetResult = await persistentBindings.resetAcpSessionInPlace({
      cfg,
      sessionKey,
      reason: "reset",
    });

    expect(resetResult).toEqual({ ok: true });
    expect(managerMocks.initializeSession).not.toHaveBeenCalled();

    const spec = persistentBindingsResolveModule.resolveConfiguredAcpBindingSpecBySessionKey({
      cfg,
      sessionKey,
    });
    expect(spec).toBeTruthy();
    managerMocks.resolveSession.mockReturnValueOnce({ kind: "none" });

    const ensured = await persistentBindings.ensureConfiguredAcpBindingSession({
      cfg,
      spec: spec!,
    });

    expect(ensured).toEqual({ ok: true, sessionKey });
    expect(managerMocks.initializeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey,
        agent: "claude",
        mode: "persistent",
        backendId: "acpx",
      }),
    );
  });

  it("clears configured harness agent sessions during in-place reset", async () => {
    const cfg = {
      ...baseCfg,
      bindings: [
        createDiscordBinding({
          agentId: "coding",
          conversationId: "1478844424791396446",
        }),
      ],
      agents: {
        list: [{ id: "main" }, { id: "coding" }],
      },
    } satisfies EnclawedConfig;
    const sessionKey = buildConfiguredAcpSessionKey({
      channel: "discord",
      accountId: "default",
      conversationId: "1478844424791396446",
      agentId: "coding",
      mode: "persistent",
      backend: "acpx",
    });
    sessionMetaMocks.readAcpSessionEntry.mockReturnValue({
      acp: {
        agent: "codex",
        mode: "persistent",
        backend: "acpx",
      },
    });

    const result = await persistentBindings.resetAcpSessionInPlace({
      cfg,
      sessionKey,
      reason: "reset",
    });

    expect(result).toEqual({ ok: true });
    expect(managerMocks.initializeSession).not.toHaveBeenCalled();
  });

  it("clears configured ACP agent overrides even when metadata omits the agent", async () => {
    const cfg = createCfgWithBindings(
      [
        createDiscordBinding({
          agentId: "coding",
          conversationId: "1478844424791396446",
        }),
      ],
      {
        agents: {
          list: [
            { id: "main" },
            {
              id: "coding",
              runtime: {
                type: "acp",
                acp: {
                  agent: "codex",
                  backend: "acpx",
                  mode: "persistent",
                },
              },
            },
            { id: "claude" },
          ],
        },
      },
    );
    const sessionKey = buildConfiguredAcpSessionKey({
      channel: "discord",
      accountId: "default",
      conversationId: "1478844424791396446",
      agentId: "coding",
      acpAgentId: "codex",
      mode: "persistent",
      backend: "acpx",
    });
    sessionMetaMocks.readAcpSessionEntry.mockReturnValue({
      acp: {
        mode: "persistent",
        backend: "acpx",
      },
    });

    const result = await persistentBindings.resetAcpSessionInPlace({
      cfg,
      sessionKey,
      reason: "reset",
    });

    expect(result).toEqual({ ok: true });
    expect(managerMocks.initializeSession).not.toHaveBeenCalled();
  });
});
