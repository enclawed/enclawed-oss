// Leaf contract for the Slack action entrypoint. Kept separate from
// action-runtime.ts so runtime.ts can type the injected handler without
// importing the action module (which records thread participation through the
// runtime store).

import type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";

export type SlackActionContext = {
  /** Current channel ID for auto-threading. */
  currentChannelId?: string;
  /** Current thread timestamp for auto-threading. */
  currentThreadTs?: string;
  /** Reply-to mode for auto-threading. */
  replyToMode?: "off" | "first" | "all" | "batched";
  /** Mutable ref to track if a reply was sent for single-use reply modes. */
  hasRepliedRef?: { value: boolean };
  /** Allowed local media directories for file uploads. */
  mediaLocalRoots?: readonly string[];
  mediaReadFile?: (filePath: string) => Promise<Buffer>;
};

export type HandleSlackAction = (
  params: Record<string, unknown>,
  cfg: EnclawedConfig,
  context?: SlackActionContext,
) => Promise<AgentToolResult<unknown>>;
