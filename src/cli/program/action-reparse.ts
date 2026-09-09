import type { Command } from "commander";
import { buildParseArgv } from "../argv.js";
import { resolveActionArgs } from "./helpers.js";

type CommanderOption = { long?: string | null; attributeName?: () => string };

/**
 * Rebuild the flags a command actually received on the command line.
 *
 * Only options whose value came from the CLI are re-emitted; defaults are
 * skipped, so a `--json` that defaulted to false does not reappear as if the
 * user had typed it.
 */
function reEmitCliOptions(cmd: Command | undefined): string[] {
  if (!cmd) {
    return [];
  }
  const withOptions = cmd as Command & {
    options?: CommanderOption[];
    getOptionValueSource?: (key: string) => string | undefined;
  };
  // Not every caller hands us a fully-built Commander instance -- action
  // callbacks receive parent objects carrying only the fields Commander has
  // populated so far. `options` and `getOptionValueSource` are already treated
  // as optional for that reason; calling `opts` unguarded turned a missing
  // field into a TypeError partway through a reparse.
  const optsFn = (cmd as { opts?: () => Record<string, unknown> }).opts;
  const values = typeof optsFn === "function" ? optsFn.call(cmd) : {};
  const out: string[] = [];
  for (const option of withOptions.options ?? []) {
    const long = option.long;
    const attr = option.attributeName?.();
    if (!long || !attr || withOptions.getOptionValueSource?.(attr) !== "cli") {
      continue;
    }
    const value = values[attr];
    if (value === true) {
      out.push(long);
    } else if (typeof value === "string" || typeof value === "number") {
      out.push(long, String(value));
    } else if (Array.isArray(value)) {
      for (const entry of value) {
        out.push(long, String(entry));
      }
    }
  }
  return out;
}

export async function reparseProgramFromActionArgs(
  program: Command,
  actionArgs: unknown[],
  /**
   * Flags the placeholder itself consumed, re-emitted for the fallback argv.
   *
   * The fallback is built from the action command's UNPARSED leftovers, so any
   * option the placeholder declares is absorbed there and never reaches the
   * real command after the lazy load. Only used when rawArgs is unavailable --
   * with rawArgs the original argv already carries them.
   */
  placeholderArgs: readonly string[] = [],
): Promise<void> {
  const actionCommand = actionArgs.at(-1) as Command | undefined;
  const root = actionCommand?.parent ?? program;
  const rawArgs = (root as Command & { rawArgs?: string[] }).rawArgs;
  const actionArgsList = resolveActionArgs(actionCommand);
  // The parent consumed its own flags before dispatching here, and the
  // fallback is built from unparsed leftovers -- so `browser --json open` lost
  // the --json on the way to the real command. Put back what the parent was
  // actually given.
  const parentArgs = reEmitCliOptions(root);
  const fallbackArgv = actionCommand?.name()
    ? [...parentArgs, actionCommand.name(), ...placeholderArgs, ...actionArgsList]
    : [...parentArgs, ...placeholderArgs, ...actionArgsList];
  const parseArgv = buildParseArgv({
    programName: program.name(),
    rawArgs,
    fallbackArgv,
  });
  await program.parseAsync(parseArgv);
}
