// Public CLI/output helpers for plugins that share terminal-facing command behavior.

export * from "../cli/command-format.js";
export * from "../cli/parse-duration.js";
export * from "../cli/wait.js";
export { stylePromptTitle } from "../terminal/prompt-style.js";
export * from "../version.js";

export { formatHelpExamples } from "../cli/help-format.js";
export { inheritOptionFromParent } from "../cli/command-options.js";
export { note } from "../terminal/note.js";
export { registerCommandGroups } from "../cli/program/register-command-groups.js";
export type {
  CommandGroupEntry,
  CommandGroupPlaceholder,
} from "../cli/program/register-command-groups.js";
export { resolveCliArgvInvocation } from "../cli/argv-invocation.js";
export { runCommandWithRuntime } from "../cli/cli-utils.js";
export { shouldEagerRegisterSubcommands } from "../cli/command-registration-policy.js";
export { theme } from "../terminal/theme.js";
