import { type SkillCommandSpec } from "../agents/skills.js";
import type { EnclawedConfig } from "../config/types.enclawed.js";
export { listReservedChatSlashCommandNames, resolveSkillCommandInvocation, } from "./skill-commands-base.js";
export declare function listSkillCommandsForWorkspace(params: {
    workspaceDir: string;
    cfg: EnclawedConfig;
    agentId?: string;
    skillFilter?: string[];
}): SkillCommandSpec[];
declare function dedupeBySkillName(commands: SkillCommandSpec[]): SkillCommandSpec[];
export declare function listSkillCommandsForAgents(params: {
    cfg: EnclawedConfig;
    agentIds?: string[];
}): SkillCommandSpec[];
export declare const __testing: {
    dedupeBySkillName: typeof dedupeBySkillName;
};
