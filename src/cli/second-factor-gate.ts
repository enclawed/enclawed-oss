// The CLI side of the mandatory second factor: both entry paths (commander's
// preAction hook and the routed fast path) call this before a command runs.
// Ungated commands cost one table lookup; the gate itself loads lazily.

import { gatedPurposeForCommand } from "../enclawed/auth/command-table.js";
import { defaultRuntime } from "../runtime.js";

export async function enforceSecondFactorOrExit(
  commandPath: readonly string[],
  argv: string[],
): Promise<void> {
  if (!gatedPurposeForCommand(commandPath, argv)) {
    return;
  }
  const { enforceCommandSecondFactor, SecondFactorError } =
    await import("./second-factor-gate.runtime.js");
  try {
    await enforceCommandSecondFactor(commandPath, argv);
  } catch (err) {
    if (err instanceof SecondFactorError) {
      defaultRuntime.error(
        `enclawed: two-factor authentication refused (${err.code}): ${err.message}`,
      );
      defaultRuntime.exit(1);
      // exit() may be stubbed (tests); never fall through to the command.
      throw err;
    }
    throw err;
  }
}
