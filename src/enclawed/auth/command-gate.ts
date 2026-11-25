// The one function both CLI entry paths (commander's preAction hook and the
// routed fast path) call before a command runs; the table of gated commands
// is command-table.ts.

import { gatedPurposeForCommand } from "./command-table.js";
import { resolveDeviceSecondFactor } from "./device-factor.js";
import { type AuthContext, type SecondFactorResult, assertSecondFactor } from "./gate.js";

export { GATED_COMMANDS, gatedPurposeForCommand } from "./command-table.js";

/**
 * Enforce the second factor for a CLI command. Resolves with null for an
 * ungated command, or with the proof; throws SecondFactorError when refused.
 */
export async function enforceCommandSecondFactor(
  commandPath: readonly string[],
  argv: string[],
  ctx: AuthContext = {},
): Promise<SecondFactorResult | null> {
  const purpose = gatedPurposeForCommand(commandPath, argv);
  if (!purpose) {
    return null;
  }
  const deviceFactor =
    ctx.deviceFactor !== undefined ? ctx.deviceFactor : await resolveDeviceSecondFactor();
  return assertSecondFactor({ ...ctx, deviceFactor }, { purpose, detail: commandPath.join(" ") });
}
