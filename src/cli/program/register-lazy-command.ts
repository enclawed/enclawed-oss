import type { Command } from "commander";
import { reparseProgramFromActionArgs } from "./action-reparse.js";
import { removeCommandByName } from "./command-tree.js";

type RegisterLazyCommandParams = {
  program: Command;
  name: string;
  description: string;
  removeNames?: string[];
  /** Flags surfaced on the placeholder before its module is loaded. */
  options?: ReadonlyArray<{ flags: string; description?: string }>;
  register: () => Promise<void> | void;
};

export function registerLazyCommand({
  program,
  name,
  description,
  removeNames,
  options,
  register,
}: RegisterLazyCommandParams): void {
  const placeholder = program.command(name).description(description);
  // Declared options are shown in the placeholder's help. Without this the
  // lazy command advertised no flags at all until its module had loaded, so
  // `--help` on an unloaded command listed none of them.
  for (const option of options ?? []) {
    placeholder.option(option.flags, option.description ?? "");
  }
  placeholder.allowUnknownOption(true);
  placeholder.allowExcessArguments(true);
  placeholder.action(async (...actionArgs) => {
    // Declaring an option above means commander consumes it here, so it would
    // vanish before the real command ever sees it. Re-emit whatever was set.
    const parsed = placeholder.opts() as Record<string, unknown>;
    const placeholderArgs: string[] = [];
    for (const option of options ?? []) {
      const long = /--([\w-]+)/.exec(option.flags)?.[1];
      if (!long) {
        continue;
      }
      const key = long.replaceAll(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      const value = parsed[key];
      if (value === true) {
        placeholderArgs.push(`--${long}`);
      } else if (typeof value === "string") {
        placeholderArgs.push(`--${long}`, value);
      }
    }
    for (const commandName of new Set(removeNames ?? [name])) {
      removeCommandByName(program, commandName);
    }
    await register();
    await reparseProgramFromActionArgs(program, actionArgs, placeholderArgs);
  });
}
