import type { SkillCommandSpec } from "../agents/skills.js";
import type { EnclawedConfig } from "../config/types.enclawed.js";
export declare function buildHelpMessage(cfg?: EnclawedConfig): string;
export type CommandsMessageOptions = {
    page?: number;
    surface?: string;
    forcePaginatedList?: boolean;
};
export type CommandsMessageResult = {
    text: string;
    totalPages: number;
    currentPage: number;
    hasNext: boolean;
    hasPrev: boolean;
};
export declare function buildCommandsMessage(cfg?: EnclawedConfig, skillCommands?: SkillCommandSpec[], options?: CommandsMessageOptions): string;
export declare function buildCommandsMessagePaginated(cfg?: EnclawedConfig, skillCommands?: SkillCommandSpec[], options?: CommandsMessageOptions): CommandsMessageResult;
