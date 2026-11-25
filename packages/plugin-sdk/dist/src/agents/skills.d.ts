import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { SkillsInstallPreferences } from "./skills/types.js";
export { hasBinary, isBundledSkillAllowed, isConfigPathTruthy, resolveBundledAllowlist, resolveConfigPath, resolveRuntimePlatform, resolveSkillConfig, } from "./skills/config.js";
export { applySkillEnvOverrides, applySkillEnvOverridesFromSnapshot, } from "./skills/env-overrides.js";
export type { EnclawedSkillMetadata, SkillEligibilityContext, SkillCommandSpec, SkillEntry, SkillInstallSpec, SkillSnapshot, SkillsInstallPreferences, } from "./skills/types.js";
export { buildWorkspaceSkillSnapshot, buildWorkspaceSkillsPrompt, filterWorkspaceSkillEntries, filterWorkspaceSkillEntriesWithOptions, loadWorkspaceSkillEntries, resolveSkillsPromptForRun, syncSkillsToWorkspace, } from "./skills/workspace.js";
export { buildWorkspaceSkillCommandSpecs } from "./skills/command-specs.js";
export declare function resolveSkillsInstallPreferences(config?: EnclawedConfig): SkillsInstallPreferences;
