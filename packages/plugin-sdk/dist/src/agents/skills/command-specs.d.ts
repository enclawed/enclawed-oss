import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { SkillEligibilityContext, SkillCommandSpec, SkillEntry } from "./types.js";
export declare function buildWorkspaceSkillCommandSpecs(workspaceDir: string, opts?: {
    config?: EnclawedConfig;
    managedSkillsDir?: string;
    bundledSkillsDir?: string;
    entries?: SkillEntry[];
    agentId?: string;
    skillFilter?: string[];
    eligibility?: SkillEligibilityContext;
    reservedNames?: Set<string>;
}): SkillCommandSpec[];
