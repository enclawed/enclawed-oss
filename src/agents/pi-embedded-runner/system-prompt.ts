import type { Agent, AgentMessage, AgentTool } from "@mariozechner/pi-agent-core";
import { createInitialSystemMessage, getCurrentTools } from "@mariozechner/pi-ai";
import type { MemoryCitationsMode } from "../../config/types.memory.js";
import type { ResolvedTimeFormat } from "../date-time.js";
import type { EmbeddedContextFile } from "../pi-embedded-helpers.js";
import type { ProviderSystemPromptContribution } from "../system-prompt-contribution.js";
import { buildAgentSystemPrompt } from "../system-prompt.js";
import type { PromptMode } from "../system-prompt.types.js";
import type { EmbeddedSandboxInfo } from "./types.js";
import type { ReasoningLevel, ThinkLevel } from "./utils.js";

export function buildEmbeddedSystemPrompt(params: {
  workspaceDir: string;
  defaultThinkLevel?: ThinkLevel;
  reasoningLevel?: ReasoningLevel;
  extraSystemPrompt?: string;
  ownerNumbers?: string[];
  ownerDisplay?: "raw" | "hash";
  ownerDisplaySecret?: string;
  reasoningTagHint: boolean;
  heartbeatPrompt?: string;
  skillsPrompt?: string;
  docsPath?: string;
  ttsHint?: string;
  reactionGuidance?: {
    level: "minimal" | "extensive";
    channel: string;
  };
  workspaceNotes?: string[];
  /** Controls which hardcoded sections to include. Defaults to "full". */
  promptMode?: PromptMode;
  /** Whether ACP-specific routing guidance should be included. Defaults to true. */
  acpEnabled?: boolean;
  runtimeInfo: {
    agentId?: string;
    host: string;
    os: string;
    arch: string;
    node: string;
    model: string;
    provider?: string;
    capabilities?: string[];
    channel?: string;
    /** Supported message actions for the current channel (e.g., react, edit, unsend) */
    channelActions?: string[];
    canvasRootDir?: string;
  };
  messageToolHints?: string[];
  sandboxInfo?: EmbeddedSandboxInfo;
  tools: AgentTool[];
  modelAliasLines: string[];
  userTimezone: string;
  userTime?: string;
  userTimeFormat?: ResolvedTimeFormat;
  contextFiles?: EmbeddedContextFile[];
  includeMemorySection?: boolean;
  memoryCitationsMode?: MemoryCitationsMode;
  promptContribution?: ProviderSystemPromptContribution;
}): string {
  return buildAgentSystemPrompt({
    workspaceDir: params.workspaceDir,
    defaultThinkLevel: params.defaultThinkLevel,
    reasoningLevel: params.reasoningLevel,
    extraSystemPrompt: params.extraSystemPrompt,
    ownerNumbers: params.ownerNumbers,
    ownerDisplay: params.ownerDisplay,
    ownerDisplaySecret: params.ownerDisplaySecret,
    reasoningTagHint: params.reasoningTagHint,
    heartbeatPrompt: params.heartbeatPrompt,
    skillsPrompt: params.skillsPrompt,
    docsPath: params.docsPath,
    ttsHint: params.ttsHint,
    workspaceNotes: params.workspaceNotes,
    reactionGuidance: params.reactionGuidance,
    promptMode: params.promptMode,
    acpEnabled: params.acpEnabled,
    runtimeInfo: params.runtimeInfo,
    messageToolHints: params.messageToolHints,
    sandboxInfo: params.sandboxInfo,
    toolNames: params.tools.map((tool) => tool.name),
    modelAliasLines: params.modelAliasLines,
    userTimezone: params.userTimezone,
    userTime: params.userTime,
    userTimeFormat: params.userTimeFormat,
    contextFiles: params.contextFiles,
    includeMemorySection: params.includeMemorySection,
    memoryCitationsMode: params.memoryCitationsMode,
    promptContribution: params.promptContribution,
  });
}

export function createSystemPromptOverride(
  systemPrompt: string,
): (defaultPrompt?: string) => string {
  const override = systemPrompt.trim();
  return (_defaultPrompt?: string) => override;
}

type SystemPromptProjectionTarget = {
  agent: Pick<Agent, "transformContext">;
};

type SystemPromptProjectionState = { prompt: string };

const systemPromptProjectionStates = new WeakMap<object, SystemPromptProjectionState>();

/**
 * Replace every system message with one leading system message whose text is
 * exactly `systemPrompt` and whose tool declarations are the transcript's
 * current tools. The leading message carries no `sections`, so pi-ai renders
 * the prompt as `systemPrompt` byte-for-byte (prompt-cache stability), and the
 * timestamp is fixed at 0 so the projection is deterministic across turns.
 */
export function projectSystemPromptOntoMessages(
  messages: AgentMessage[],
  systemPrompt: string,
): AgentMessage[] {
  const tools = getCurrentTools(messages);
  const head = createInitialSystemMessage(systemPrompt, tools.length > 0 ? tools : undefined);
  const conversation = messages.filter((message) => message.role !== "system");
  return head ? [head, ...conversation] : conversation;
}

/**
 * Make `override` the exact system prompt of every model request the session's
 * agent loop sends.
 *
 * pi-coding-agent >= 0.87 builds its own structured prompt (sections persisted
 * as system messages in the session transcript) and `agent.state.systemPrompt`
 * is read-only. Enclawed owns the prompt, so the request-time transcript is
 * projected instead: the outermost `transformContext` collapses pi's system
 * messages into one leading message holding Enclawed's prompt and the current
 * tool declarations. This only affects the agent loop's model requests (the
 * same scope the pre-0.87 `agent.state.systemPrompt` override had); pi's own
 * compaction/summary requests keep their dedicated prompts. Calling this again
 * on the same session swaps the prompt without stacking another wrapper.
 */
export function applySystemPromptOverrideToSession(
  session: SystemPromptProjectionTarget,
  override: string | ((defaultPrompt?: string) => string),
) {
  const prompt = typeof override === "function" ? override() : override.trim();
  const existing = systemPromptProjectionStates.get(session.agent);
  if (existing) {
    existing.prompt = prompt;
    return;
  }
  const state: SystemPromptProjectionState = { prompt };
  systemPromptProjectionStates.set(session.agent, state);
  const previousTransformContext = session.agent.transformContext;
  session.agent.transformContext = async (messages, signal) => {
    const transformed = previousTransformContext
      ? await previousTransformContext(messages, signal)
      : messages;
    return projectSystemPromptOntoMessages(transformed, state.prompt);
  };
}
