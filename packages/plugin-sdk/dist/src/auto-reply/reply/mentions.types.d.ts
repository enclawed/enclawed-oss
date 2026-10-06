import type { EnclawedConfig } from "../../config/types.enclawed.js";
export type BuildMentionRegexes = (cfg: EnclawedConfig | undefined, agentId?: string) => RegExp[];
export type MatchesMentionPatterns = (text: string, mentionRegexes: RegExp[]) => boolean;
export type ExplicitMentionSignal = {
    hasAnyMention: boolean;
    isExplicitlyMentioned: boolean;
    canResolveExplicit: boolean;
};
export type MatchesMentionWithExplicit = (params: {
    text: string;
    mentionRegexes: RegExp[];
    explicit?: ExplicitMentionSignal;
    transcript?: string;
}) => boolean;
