import type { EnclawedConfig } from "../../config/types.enclawed.js";
import { type SkillEntry, type SkillSnapshot } from "../skills.js";
export declare function resolveEmbeddedRunSkillEntries(params: {
    workspaceDir: string;
    config?: EnclawedConfig;
    agentId?: string;
    skillsSnapshot?: SkillSnapshot;
}): {
    shouldLoadSkillEntries: boolean;
    skillEntries: SkillEntry[];
};
