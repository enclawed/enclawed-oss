// enclawed adapter kit: aliases and functions of the shell a command runs in.
//
// The read-only allowlist (./shell-readonly.ts) and every rule that reads a
// command's words assume a command word runs the program (or builtin) of that
// name. A host whose shell first sources definitions (a host may source a
// snapshot of the person's login shell: its aliases and functions; any bash
// imports the functions its environment exports as BASH_FUNC_NAME%%) breaks
// that assumption: an alias is text substituted for the word before it is
// read, and a function named `ls`, `cat`, `cd`, `exec` or even `/usr/bin/env`
// runs in place of the program or builtin of that name (bash looks a
// function up before builtins and PATH, slashes or not).
//
// The adapter passes what the shell defines (EngineOptions.shellDefinitions),
// or "unknown" when it cannot establish it. A simple command's command word
// is shadowed, and so never decided as the program of its name, when:
//   - the definitions are unknown (any word may be anything);
//   - it is an alias and the word is alias-eligible (unquoted literal text:
//     `\ls`, `'ls'` or `l\s` skip aliases), unless the alias is the same
//     name with display-only `--color` options and the command with them is
//     still read-only by the allowlist (ls='ls --color=auto');
//   - it is a function (quoting does not skip a function);
//   - the shell defines command_not_found_handle (a word found nowhere runs it).
// An alias named after a reserved word (`if`, `do`, `{`) changes how the line
// itself is read: every word is then shadowed. `command X`, `builtin X` and
// `exec X` look no function or alias up for X (X is the real program), but
// `command`, `builtin` and `exec` are themselves command words. Programs other
// programs start (xargs, find -exec, env, nice, timeout) are exec'd, never a
// function. An `unalias` or `unset -f` on the same line removes nothing here
// (bash reads aliases when it reads the line, and a function the line removes
// is still decided as defined): the line's words stay shadowed.

import type { SimpleCommand } from "./shell-compound.js";
import { classifyArgv } from "./shell-readonly.js";

/** The aliases and functions defined in the shell the agent's commands run in. */
export type ShellDefinitions = Readonly<{
  /** Alias name -> the text it stands for. */
  aliases: Readonly<Record<string, string>>;
  /** Function names (those exported as BASH_FUNC_NAME%% included). */
  functions: readonly string[];
}>;

/** A shell with no aliases and no functions (exported ones in the environment are still added). */
export const NO_SHELL_DEFINITIONS: ShellDefinitions = Object.freeze({
  aliases: Object.freeze({}),
  functions: Object.freeze([]) as readonly string[],
});

/** What the kit decides against: the definitions, or unknown. */
export type ResolvedDefinitions =
  | Readonly<{ known: false; why: string }>
  | Readonly<{
      known: true;
      aliases: ReadonlyMap<string, string>;
      functions: ReadonlySet<string>;
      /** An alias named after a reserved word, or command_not_found_handle: every word is shadowed. */
      everyWord: string | null;
    }>;

// Words bash reads as reserved before the command word; an alias of one changes the line's grammar.
const RESERVED = new Set(
  "if then else elif fi case esac for select while until do done in function time coproc { } ! [[ ]]".split(
    " ",
  ),
);

const EXPORTED_FUNCTION = /^BASH_FUNC_(.+?)(?:%%|\(\))$/;

/** The function names an environment exports to every bash it starts (BASH_FUNC_NAME%%). */
export function exportedFunctionNames(
  env: Readonly<Record<string, string | undefined>> | null | undefined,
): string[] {
  if (!env) {
    return [];
  }
  return Object.keys(env).flatMap((k) => {
    const m = EXPORTED_FUNCTION.exec(k);
    return m ? [m[1]] : [];
  });
}

/**
 * The definitions the kit decides against: the adapter's (absent, null or
 * "unknown": unknown), with the functions `env` exports added.
 */
export function resolveShellDefinitions(
  defs: ShellDefinitions | "unknown" | null | undefined,
  env: Readonly<Record<string, string | undefined>> | null | undefined,
): ResolvedDefinitions {
  if (!defs || defs === "unknown") {
    return {
      known: false,
      why: "the aliases and functions of the shell this command runs in are not known, so no command word can be taken for the program of its name",
    };
  }
  if (
    typeof defs !== "object" ||
    !defs.aliases ||
    typeof defs.aliases !== "object" ||
    !Array.isArray(defs.functions)
  ) {
    return { known: false, why: "the shell's definitions were not given in a form the kit reads" };
  }
  const aliases = new Map<string, string>();
  for (const [k, v] of Object.entries(defs.aliases)) {
    aliases.set(k, typeof v === "string" ? v : "");
  }
  const functions = new Set<string>([...defs.functions.map(String), ...exportedFunctionNames(env)]);
  const reservedAlias = [...aliases.keys()].find((k) => RESERVED.has(k));
  const everyWord = reservedAlias
    ? `the shell defines an alias named ${JSON.stringify(reservedAlias)}, a reserved word, so the line is not read as written`
    : functions.has("command_not_found_handle")
      ? "the shell defines command_not_found_handle, which runs for any word it finds no program for"
      : null;
  return { known: true, aliases, functions, everyWord };
}

/** True when the shell has no definitions at all (nothing can shadow a word). */
export function definesNothing(d: ResolvedDefinitions): boolean {
  return d.known && d.aliases.size === 0 && d.functions.size === 0;
}

const COLOR_OPTION = /^--colou?r(?:=(?:auto|always|never|tty|if-tty))?$/;

/** `ls='ls --color=auto'`: the alias's extra words, when it is that shape; else null. */
function colorSelfAlias(name: string, value: string): string[] | null {
  // A blank at the end makes bash read the next word as an alias too: not this shape.
  if (!/^[A-Za-z0-9_.=:+@%,-]+(?:[ \t]+[A-Za-z0-9_.=:+@%,-]+)*$/.test(value)) {
    return null;
  }
  const words = value.split(/[ \t]+/);
  if (words[0] !== name || words.length < 2 || !words.slice(1).every((w) => COLOR_OPTION.test(w))) {
    return null;
  }
  return words.slice(1);
}

const show = (s: string) => JSON.stringify(s.length > 160 ? `${s.slice(0, 160)}...` : s);

/**
 * Why the command `c` runs something other than the program or builtin its
 * command word names (an alias, a function, unknown definitions), or null.
 */
export function shadowOf(c: SimpleCommand, d: ResolvedDefinitions): string | null {
  const w = c.commandWord;
  if (!w) {
    return null; // runs nothing (NAME=VALUE alone)
  }
  if (!d.known) {
    return d.why;
  }
  if (d.everyWord) {
    return d.everyWord;
  }
  const name = w.name;
  if (w.aliasable && d.aliases.has(name)) {
    const value = d.aliases.get(name) ?? "";
    const extra = colorSelfAlias(name, value);
    // The same program with color only, and still read-only with it.
    if (
      !extra ||
      c.argv[0] !== name ||
      !classifyArgv([name, ...extra, ...c.argv.slice(1)]).readOnly
    ) {
      return `${show(name)} is an alias of the shell this command runs in, for ${show(value)} (quoted from the shell's startup files), not the program of that name`;
    }
  }
  if (d.functions.has(name)) {
    return `${show(name)} is a function of the shell this command runs in (quoted from the shell's startup files or environment), not the program of that name`;
  }
  return null;
}

/** The first shadowed command of a line, as a reason, or null. */
export function shadowedCommandIn(
  commands: readonly SimpleCommand[],
  d: ResolvedDefinitions,
): string | null {
  for (const c of commands) {
    const why = shadowOf(c, d);
    if (why) {
      return why;
    }
  }
  return null;
}

/**
 * For a line the kit does not split into commands: may it invoke any alias
 * or function (unknown definitions; or a defined name appearing as any word,
 * quotes removed)? A superset of the line's command words.
 */
export function lineMayInvokeDefinition(text: string, d: ResolvedDefinitions): boolean {
  if (!d.known || d.everyWord) {
    return true;
  }
  if (definesNothing(d)) {
    return false;
  }
  const words = new Set(text.replace(/['"\\]/g, "").split(/[\s;&|()<>`$]+/));
  return [...d.aliases.keys(), ...d.functions].some((n) => words.has(n));
}

/**
 * Do the aliases leave how a line is lexed unchanged? An alias's text is read
 * in place of its word, so one holding a quote, an escape, a comment or a
 * here-document could open or close a quote of the line. Unknown: no.
 */
export function aliasesLexNeutral(d: ResolvedDefinitions): boolean {
  if (!d.known || d.everyWord) {
    return false;
  }
  return [...d.aliases.values()].every((v) => !/['"\\`$#<]/.test(v));
}

const sq = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;

/**
 * How a contained command line starts in the host's shell. `POSIXLY_CORRECT=1`
 * is an assignment, never a command word (no alias or function is looked up
 * for it); in bash it turns POSIX mode on, in which a POSIX special builtin
 * such as `exec` is found before any function, and the backslash keeps
 * `exec` from being read as an alias (`&&`: when the assignment fails, a
 * readonly POSIXLY_CORRECT, nothing runs). So in bash the line reaches its
 * containment whatever aliases and functions the shell defines (known or
 * not); `/usr/bin/env` is named by its path (no PATH lookup). In another
 * shell the assignment is inert and the line is decided against the shell's
 * definitions as any line is.
 */
export const CONTAINED_LAUNCH_PREFIX = "POSIXLY_CORRECT=1 && \\exec /usr/bin/env -i";

/**
 * The command line the host's shell runs for a contained command
 * (./contained-launch.ts scriptContainer): CONTAINED_LAUNCH_PREFIX with the
 * containment's environment and argv, each one single-quoted word.
 */
export function containedCommandLine(
  env: Readonly<Record<string, string>>,
  argv: readonly string[],
): string {
  const e = Object.entries(env).map(([k, v]) => sq(`${k}=${v}`));
  return [CONTAINED_LAUNCH_PREFIX, ...e, ...argv.map(sq)].join(" ");
}

// The prefix, then single-quoted words only (sq: '...' and \' pieces), at least one.
const LAUNCH_LINE = /^POSIXLY_CORRECT=1 && \\exec \/usr\/bin\/env -i(?: (?:'[^']*'|\\')+)+$/;

/**
 * Is `text` exactly a line containedCommandLine makes? Run by bash, such a
 * line goes through none of the shell's aliases or functions (see
 * CONTAINED_LAUNCH_PREFIX), so it needs no knowledge of them.
 */
export function isContainedLaunchLine(text: string): boolean {
  return LAUNCH_LINE.test(text);
}
