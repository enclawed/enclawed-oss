import type { Word } from "./shell-words.js";
export type SshTarget = {
    user: string | null;
    host: string;
};
export type SshCall = {
    target: SshTarget | null;
    jumps: SshTarget[];
    /** The remote command as the remote shell will see it; null for an interactive login. */
    command: string | null;
    problems: string[];
};
export declare function parseTarget(text: string): SshTarget | null;
/** Parses `ssh [options] [user@]host [command...]` (the words after "ssh"). */
export declare function parseSsh(args: Word[]): SshCall;
export type CopyCall = {
    /** Files sent to the cluster: local source -> remote destination. */
    uploads: {
        local: string;
        host: SshTarget;
        remote: string;
    }[];
    /** Files fetched from the cluster. */
    downloads: {
        host: SshTarget;
        remote: string;
        local: string;
    }[];
    /** Copies that never touch a remote host. */
    localOnly: boolean;
    problems: string[];
};
/** Parses scp or rsync (the words after the command name). */
export declare function parseCopy(tool: "scp" | "rsync", args: Word[]): CopyCall;
/** True when `p` (resolved against `base`) lies inside directory `dir`. */
export declare function within(dir: string, p: string, base?: string): boolean;
