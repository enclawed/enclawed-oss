import { type SpawnSyncOptions, type SpawnSyncReturns } from "node:child_process";
import fs from "node:fs";
import { type GitProgram } from "./git-programs.js";
/** How git sees a file: tracked, untracked, ignored, outside any work tree, or unknown (git missing or failed). */
export type GitTracking = "tracked" | "untracked" | "ignored" | "no-repo" | "unknown";
/** What Enclawed protects from the agent: its own state, policy, audit log, history and code. */
export type ProtectedSet = Readonly<{
    /** Files and directories (absolute). */
    paths: readonly string[];
    /** Files named `<basename>*` inside `dir` (a latch file and its siblings). */
    prefixes: readonly {
        dir: string;
        basename: string;
    }[];
    /** Paths a shell command may name without being refused (a directory the agent legitimately lists). */
    mentionExempt?: readonly string[];
    /** The adapter's own state (audit log, session, policy, latch files): indexed first, so a small walk covers it. */
    statePaths?: readonly string[];
    /** An index of the protected inodes written at launch (writeProtectedInodeIndex), used while its digest matches. */
    inodeIndex?: Readonly<{
        file: string;
        digest: string;
    }>;
}>;
/**
 * What a write target that is also another file is. "protected-unknown": the
 * protected trees were too large to rule its inode out; `match` is then the
 * project's exec-config file it is, when it is one. "exec-config": it is one
 * of the project's files that configure what runs later (by inode).
 */
export type HardLinkVerdict = null | Readonly<{
    kind: "protected";
    nlink: number;
    match: string;
}> | Readonly<{
    kind: "protected-unknown";
    nlink: number;
    match: string | null;
}> | Readonly<{
    kind: "exec-config";
    nlink: number;
    match: string;
}> | Readonly<{
    kind: "multiply-linked";
    nlink: number;
    complete?: boolean;
}>;
/** Where to look for the exec-config file a hard-linked target may be. */
export type ExecConfigScope = Readonly<{
    projectDir: string;
    isExecConfig: (absPath: string) => boolean;
}>;
export interface FsProbe {
    /** realpath of the longest existing prefix, with the rest appended. */
    realpathNearest(abs: string): string;
    /** Permission bits of a regular file (no symlink follow), or null. */
    fileMode(p: string): number | null;
    /**
     * A target that is also another file (hard link, bind mount): is it one of
     * the protected files, or (with `execConfig`) one of the project's
     * exec-config files?
     */
    hardLink(realPath: string, prot: ProtectedSet | null, execConfig?: ExecConfigScope | null): HardLinkVerdict;
    /** Is `realPath` the same inode as one of the secret files? Returns that secret, or null. */
    sameInodeAs(realPath: string, candidates: readonly string[]): string | null;
    gitTracking(realPath: string): GitTracking;
    /** The first line of the repository's git config that can start a program, or null. */
    gitConfigRisk?(cwd: string): string | null;
    /**
     * The programs the repository's git configuration and hooks can make git
     * start (./git-programs.ts), or null when they could not be read. With it,
     * a read-only git command is checked against the programs it actually starts.
     */
    gitPrograms?(cwd: string): readonly GitProgram[] | null;
    /** HEAD's tree of the repository holding `dir` (gitCommittedTreeOf), or null. */
    committedTree?(dir: string): {
        top: string;
        blobs: ReadonlyMap<string, string>;
    } | null;
}
export declare function comparablePath(p: string): string;
/** Is `child` inside (or equal to) `dir`? Compared case-insensitively after NFC (macOS and Windows fold case). */
export declare function isInside(dir: string, child: string): boolean;
/** Exact containment, no case folding: an allowance never matches by folding. */
export declare function isInsideExact(dir: string, child: string): boolean;
export declare function realpathNearestSync(abs: string): string;
/** ~, $HOME and ${HOME} at the start of a path, expanded. */
export declare function expandHome(p: string, home: string | null | undefined): string;
export declare function isProtectedPath(prot: ProtectedSet, absPaths: readonly (string | null)[]): boolean;
export declare function systemBinaryUids(extra?: readonly number[]): number[];
/**
 * Why `file` is not a trusted system executable, or null when it is: the
 * file it resolves to (symlinks followed) is a regular executable owned by a
 * system uid and not group/other-writable, and every directory above both the
 * link and its target is too.
 */
export declare function untrustedBinaryReason(file: string, uids?: readonly number[]): string | null;
export declare function trustedBinary(name: string, dirs?: readonly string[], o?: Readonly<{
    testUids?: readonly number[];
}>): string | null;
type Runner = (cmd: string, args: readonly string[], opts: Omit<SpawnSyncOptions, "encoding">) => Pick<SpawnSyncReturns<string>, "status" | "stderr" | "error">;
/**
 * Whether git keeps a copy of the file. Repository config that could start a
 * program during the lookup is neutralized, no GIT_* variable from the
 * environment is passed on, and the name is matched literally, never as a
 * pattern.
 */
export declare function gitTrackingOf(realPath: string, opts?: {
    run?: Runner;
    gitBin?: string | null;
}): GitTracking;
/**
 * HEAD's tree of the repository holding `dir`: path relative to the
 * repository's top (with "/") -> blob id, or null when it cannot be read.
 * Read with `git ls-tree` (no index, no working tree: no filter, fsmonitor
 * or hook runs), the same system git and scrubbed environment as
 * gitTrackingOf.
 */
export declare function gitCommittedTreeOf(dir: string, opts?: {
    run?: Runner;
    gitBin?: string | null;
}): {
    top: string;
    blobs: Map<string, string>;
} | null;
/** The repository git config line (with its file) that could make a git command in `cwd` start a program, or null. */
export declare function gitConfigRiskOf(cwd: string): string | null;
export declare const PROTECTED_WALK_BUDGET = 20000;
/**
 * Write the protected inode index once at launch into a file the agent may
 * not write (the adapter's session directory); the adapter keeps the digest
 * in its session record and passes both as ProtectedSet.inodeIndex.
 */
export declare function writeProtectedInodeIndex(prot: ProtectedSet, file: string): {
    file: string;
    digest: string;
    entries: number;
    complete: boolean;
};
export type ProtectedInodeIndex = {
    map: Map<string, string>;
    complete: boolean;
    precomputed: boolean;
};
/**
 * The inodes of the protected files and directories: the precomputed index
 * (while its digest still matches) plus a live, bounded walk of the state
 * paths first, which also covers files created after launch. With no
 * precomputed index the walk gets `budget`.
 */
export declare function protectedInodeIndex(prot: ProtectedSet, budget?: number): ProtectedInodeIndex;
export declare const PROJECT_WALK_BUDGET = 20000;
/**
 * The project's exec-config file with the same inode as `st`, walking the
 * project on the target's filesystem with a work budget. node_modules and
 * .git/objects are skipped: never exec-config, and often huge (git objects
 * are hard-linked by `git clone --local`).
 */
export declare function execConfigInodeMatch(scope: ExecConfigScope, st: Pick<fs.Stats, "dev" | "ino">, budget?: number): {
    match: string | null;
    complete: boolean;
};
/** The real filesystem probe. Inode indexes are built once per protected set. */
export declare function nodeFsProbe(opts?: {
    budget?: number;
    projectBudget?: number;
    gitConfigRisk?: (cwd: string) => string | null;
    gitPrograms?: (cwd: string) => readonly GitProgram[] | null;
}): FsProbe;
/** The words of a command that may be paths (quotes dropped, option values kept). */
export declare function pathWords(command: string): string[];
export {};
