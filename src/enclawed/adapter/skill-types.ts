// enclawed adapter kit: the skill types the engine options and the rules
// share, a leaf module (types only) so ./types.ts and ./rule-kit.ts name them
// without importing ./skill-conformance.ts. Re-exported by both modules.

/**
 * The verified skills of this session (skill admission at launch). The
 * admission facts (contentDigest, files, caps, egress) are what per-call
 * conformance (./skill-conformance.ts) decides with; a verified skill given
 * without them is never attributed a call (its calls keep the ordinary rules).
 */
export type SkillSet = Readonly<{
  verified: readonly Readonly<{
    name: string;
    dir: string;
    contentDigest?: string;
    files?: Readonly<Record<string, string>>;
    caps?: readonly string[];
    egress?: readonly string[];
  }>[];
  roots: readonly string[];
  /** Skills found at launch that did not verify (switched off): their directories are skill directories too. */
  excluded?: readonly { name: string; dir: string }[];
}>;

/** What a conforming call runs: the skill's file under its interpreter, with these arguments. */
export type SkillRun = Readonly<{
  name: string;
  /** The skill's real directory (the launcher copies it and re-checks the digest). */
  dir: string;
  contentDigest: string;
  caps: readonly string[];
  /** Declared net.egress targets, canonical. */
  egress: readonly string[];
  /** The executed file, relative to `dir` ("/"-separated). */
  file: string;
  /** Interpreter program name, looked up by the containment in the system directories. */
  interpreter: string;
  args: readonly string[];
}>;
