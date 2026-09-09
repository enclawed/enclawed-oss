import type { EnclawedConfig } from "../../config/types.js";
type AgentSkillsLimits = {
    maxSkillsPromptChars?: number;
};
/**
 * Explicit per-agent skills win when present; otherwise fall back to shared defaults.
 * Unknown agent ids also fall back to defaults so legacy/unresolved callers do not widen access.
 */
export declare function resolveEffectiveAgentSkillFilter(cfg: EnclawedConfig | undefined, agentId: string | undefined): string[] | undefined;
export declare function resolveEffectiveAgentSkillsLimits(cfg: EnclawedConfig | undefined, agentId: string | undefined): AgentSkillsLimits | undefined;
export {};
