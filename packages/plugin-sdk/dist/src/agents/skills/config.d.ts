import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { SkillConfig } from "../../config/types.skills.js";
import { hasBinary, resolveConfigPath, resolveRuntimePlatform } from "../../shared/config-eval.js";
import type { SkillEligibilityContext, SkillEntry } from "./types.js";
export { hasBinary, resolveConfigPath, resolveRuntimePlatform };
export declare function isConfigPathTruthy(config: EnclawedConfig | undefined, pathStr: string): boolean;
export declare function resolveSkillConfig(config: EnclawedConfig | undefined, skillKey: string): SkillConfig | undefined;
export declare function resolveBundledAllowlist(config?: EnclawedConfig): string[] | undefined;
export declare function isBundledSkillAllowed(entry: SkillEntry, allowlist?: string[]): boolean;
export declare function shouldIncludeSkill(params: {
    entry: SkillEntry;
    config?: EnclawedConfig;
    eligibility?: SkillEligibilityContext;
}): boolean;
