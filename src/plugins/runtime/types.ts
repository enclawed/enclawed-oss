import type { PluginRuntimeChannel } from "./types-channel.js";
import type { PluginRuntimeCore, RuntimeLogger } from "./types-core.js";

export type { RuntimeLogger };

// ── Subagent runtime types ──────────────────────────────────────────

export type SubagentRunParams = {
  sessionKey: string;
  message: string;
  provider?: string;
  model?: string;
  extraSystemPrompt?: string;
  lane?: string;
  deliver?: boolean;
  idempotencyKey?: string;
};

export type SubagentRunResult = {
  runId: string;
};

export type SubagentWaitParams = {
  runId: string;
  timeoutMs?: number;
};

export type SubagentWaitResult = {
  status: "ok" | "error" | "timeout";
  error?: string;
};

export type SubagentGetSessionMessagesParams = {
  sessionKey: string;
  limit?: number;
};

export type SubagentGetSessionMessagesResult = {
  messages: unknown[];
};

/** @deprecated Use SubagentGetSessionMessagesParams. */
export type SubagentGetSessionParams = SubagentGetSessionMessagesParams;

/** @deprecated Use SubagentGetSessionMessagesResult. */
export type SubagentGetSessionResult = SubagentGetSessionMessagesResult;

export type SubagentDeleteSessionParams = {
  sessionKey: string;
  deleteTranscript?: boolean;
};

/** Trusted in-process runtime surface injected into native plugins. */
export type PluginRuntime = PluginRuntimeCore & {
  /**
   * Trusted in-process plugins always receive the full config surface,
   * including the snapshot accessor and config-mutation entry points. The
   * narrow control-plane runtime keeps those optional, so re-require them here
   * for the in-process runtime that bundled channels/providers consume.
   */
  config: PluginRuntimeCore["config"] &
    Required<
      Pick<PluginRuntimeCore["config"], "current" | "mutateConfigFile" | "replaceConfigFile">
    >;
  subagent: {
    run: (params: SubagentRunParams) => Promise<SubagentRunResult>;
    waitForRun: (params: SubagentWaitParams) => Promise<SubagentWaitResult>;
    getSessionMessages: (
      params: SubagentGetSessionMessagesParams,
    ) => Promise<SubagentGetSessionMessagesResult>;
    /** @deprecated Use getSessionMessages. */
    getSession: (params: SubagentGetSessionParams) => Promise<SubagentGetSessionResult>;
    deleteSession: (params: SubagentDeleteSessionParams) => Promise<void>;
  };
  channel: PluginRuntimeChannel;
  /**
   * Gateway node access exposed to plugins that need to enumerate registered
   * remote nodes (sandbox/voice/etc.) or invoke registered node commands.
   * Optional because the host only attaches it when a real node runtime is
   * wired in — plugins that depend on it must check for presence before use.
   */
  nodes?: {
    list: (params?: {
      capability?: string;
      includeOffline?: boolean;
      timeoutMs?: number;
    }) => Promise<{
      nodes: ReadonlyArray<{
        nodeId: string;
        capabilities?: ReadonlyArray<string>;
        commands?: ReadonlyArray<string>;
        online?: boolean;
        displayName?: string;
      }>;
    }>;
    invoke: (params: {
      nodeId: string;
      command: string;
      params?: Record<string, unknown>;
      timeoutMs?: number;
      idempotencyKey?: string;
    }) => Promise<unknown>;
  };
};

export type CreatePluginRuntimeOptions = {
  subagent?: PluginRuntime["subagent"];
  allowGatewaySubagentBinding?: boolean;
};
