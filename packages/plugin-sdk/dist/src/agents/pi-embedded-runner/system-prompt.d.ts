import type { Agent, AgentMessage, AgentTool } from "@mariozechner/pi-agent-core";
import type { MemoryCitationsMode } from "../../config/types.memory.js";
import type { ResolvedTimeFormat } from "../date-time.js";
import type { EmbeddedContextFile } from "../pi-embedded-helpers.js";
import type { ProviderSystemPromptContribution } from "../system-prompt-contribution.js";
import type { PromptMode } from "../system-prompt.types.js";
import type { EmbeddedSandboxInfo } from "./types.js";
import type { ReasoningLevel, ThinkLevel } from "./utils.js";
export declare function buildEmbeddedSystemPrompt(params: {
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
}): string;
export declare function createSystemPromptOverride(systemPrompt: string): (defaultPrompt?: string) => string;
type SystemPromptProjectionTarget = {
    agent: Pick<Agent, "transformContext">;
};
/**
 * Replace every system message with one leading system message whose text is
 * exactly `systemPrompt` and whose tool declarations are the transcript's
 * current tools. The leading message carries no `sections`, so pi-ai renders
 * the prompt as `systemPrompt` byte-for-byte (prompt-cache stability), and the
 * timestamp is fixed at 0 so the projection is deterministic across turns.
 */
export declare function projectSystemPromptOntoMessages(messages: AgentMessage[], systemPrompt: string): AgentMessage[];
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
export declare function applySystemPromptOverrideToSession(session: SystemPromptProjectionTarget, override: string | ((defaultPrompt?: string) => string)): void;
export {};
