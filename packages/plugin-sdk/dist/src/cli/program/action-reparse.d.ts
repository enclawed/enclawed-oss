import type { Command } from "commander";
export declare function reparseProgramFromActionArgs(program: Command, actionArgs: unknown[], 
/**
 * Flags the placeholder itself consumed, re-emitted for the fallback argv.
 *
 * The fallback is built from the action command's UNPARSED leftovers, so any
 * option the placeholder declares is absorbed there and never reaches the
 * real command after the lazy load. Only used when rawArgs is unavailable --
 * with rawArgs the original argv already carries them.
 */
placeholderArgs?: readonly string[]): Promise<void>;
