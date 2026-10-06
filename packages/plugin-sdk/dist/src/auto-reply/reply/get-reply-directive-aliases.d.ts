import type { SkillCommandSpec } from "../../agents/skills.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
export declare function reserveSkillCommandNames(params: {
    reservedCommands: Set<string>;
    skillCommands: SkillCommandSpec[];
}): void;
export declare function resolveConfiguredDirectiveAliases(params: {
    cfg: EnclawedConfig;
    commandTextHasSlash: boolean;
    reservedCommands: Set<string>;
}): string[];
