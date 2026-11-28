// Types for skill-formal-uses.mjs (the second pass of Method A).

export type SkillUses = {
  /** Capability tokens the uses of programs and libraries reach. */
  unionEffects: string[];
  /** Scripts whose effects cannot be bounded, and why. */
  unbounded: { script: string; reason: string }[];
  /** With declared write folders: writes whose path is not a literal inside one. */
  escapingWrites: { script: string; value: string }[];
};

export function analyzeSkillUses(dir: string, writeRoots?: readonly string[] | null): SkillUses;

export function usesOf(
  src: string,
  language: string,
  where?: { file?: string | null; root?: string | null },
): { effects: [string, string][]; top: string | null };

export function clearUsesCache(): void;
