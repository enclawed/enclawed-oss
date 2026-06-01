import type { SkillCommandSpec } from "../agents/skills/types.js";
import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { ChatCommandDefinition } from "./commands-registry.types.js";
export declare function listChatCommands(params?: {
    skillCommands?: SkillCommandSpec[];
}): ChatCommandDefinition[];
export declare function isCommandEnabled(cfg: EnclawedConfig, commandKey: string): boolean;
export declare function listChatCommandsForConfig(cfg: EnclawedConfig, params?: {
    skillCommands?: SkillCommandSpec[];
}): ChatCommandDefinition[];
