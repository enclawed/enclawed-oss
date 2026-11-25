// enclawed adapter kit: leaf contracts (types and constants with no imports),
// shared by modules that would otherwise import each other. (Type-only
// imports are erased and add no runtime edge.)

import type { SimpleCommand } from "./shell-compound.js";

/**
 * Shell classification: whether a command is on a strict read-only
 * allowlist. The kit's default is strictShellClassifier (./shell-readonly.ts,
 * a getopt-exact allowlist parser ported from codenclawed). An adapter may
 * pass a stricter one; conservativeShellClassifier treats every command as
 * not read-only (every command asks).
 */
export type ShellVerdict =
  | Readonly<{
      readOnly: true;
      git?: Readonly<{ cdirs: readonly string[] }>;
      /** The simple commands of the line, each with the directory it runs in (when the classifier was given one). */
      commands?: readonly SimpleCommand[];
      /** Every git command of the line: where it runs, its subcommand and arguments. */
      gits?: readonly Readonly<{
        cwd: string;
        sub: string;
        args: readonly string[];
        global?: readonly string[];
      }>[];
    }>
  | Readonly<{ readOnly: false; code: string; detail?: string }>;

export interface ShellClassifier {
  /**
   * `ctx`: the directory the command runs in and the home directory. With it,
   * a classifier may accept a line of several commands and the expansions
   * whose value it knows; without it, only one simple command.
   */
  classify(
    command: string,
    dialect: "posix" | "powershell",
    ctx?: Readonly<{
      cwd: string;
      home: string | null;
      /** The top of the git work tree a directory is in, when the caller can tell. */
      gitTop?: (dir: string) => string | null;
      /** The session's environment, when the caller knows it. */
      env?: Readonly<Record<string, string>> | null;
    }>,
  ): ShellVerdict;
}

export const MCP_ARGUMENT_ROLES = [
  "git-rev",
  "positional",
  "path-ro",
  "path-rw",
  "url",
  "opaque",
] as const;
export type McpArgumentRole = (typeof MCP_ARGUMENT_ROLES)[number];

/** tool name -> argument name -> role. */
export type McpArgumentRoles = Readonly<Record<string, Readonly<Record<string, McpArgumentRole>>>>;

/** The parts of a server definition that make its identity (no secrets kept: the whole is hashed). */
export type McpServerDefinition = Readonly<{
  type?: string;
  command?: string | null;
  args?: readonly unknown[];
  env?: Readonly<Record<string, unknown>>;
  url?: string | null;
  headers?: Readonly<Record<string, unknown>>;
}>;
