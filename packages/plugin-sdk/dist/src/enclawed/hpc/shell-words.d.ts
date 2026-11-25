export type Word = {
    /** The word with quotes and backslashes removed. */
    text: string;
    /** True if the shell would expand part of it (variable, command substitution, glob). */
    dynamic: boolean;
};
export type SimpleCommand = {
    words: Word[];
    /** File redirected to stdin with `<`, if any; `sbatch < job.sh` reads its script from it. */
    stdinFile: Word | null;
    /** True when a heredoc (<<) feeds this command; its body is not parsed. */
    heredoc: boolean;
};
export type ParseResult = {
    ok: true;
    commands: SimpleCommand[];
} | {
    ok: false;
    reason: string;
};
/** Splits a command line into simple commands. */
export declare function parseCommandLine(input: string): ParseResult;
