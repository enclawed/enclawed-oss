import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { SkillEntry, SkillSnapshot } from "./types.js";
/** Returns a snapshot of env var keys currently injected by skill overrides. */
export declare function getActiveSkillEnvKeys(): ReadonlySet<string>;
export declare function applySkillEnvOverrides(params: {
    skills: SkillEntry[];
    config?: EnclawedConfig;
}): () => void;
export declare function applySkillEnvOverridesFromSnapshot(params: {
    snapshot?: SkillSnapshot;
    config?: EnclawedConfig;
}): () => void;
