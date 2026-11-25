export type GitProgramKind = "fsmonitor" | "filter" | "textconv" | "diff-command" | "hook" | "pager" | "gpg" | "include";
export type GitProgram = Readonly<{
    kind: GitProgramKind;
    line: string;
}>;
/**
 * The programs the repository holding `cwd` can make git start: its config
 * files (with sections) and a post-index-change hook in its hooks directory.
 * null: the configuration could not be read (callers treat that as a risk).
 */
export declare function gitProgramsOf(cwd: string): GitProgram[] | null;
/**
 * The first configured program this read-only git command would start, or
 * null. `global`: the options before the subcommand (only -C and --no-pager
 * pass the allowlist).
 */
export declare function gitCommandStarts(call: Readonly<{
    sub: string;
    args: readonly string[];
    global?: readonly string[];
}>, programs: readonly GitProgram[]): GitProgram | null;
