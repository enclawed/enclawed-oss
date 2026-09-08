import type { DmPolicy } from "@enclawed/plugin-sdk/config-types";
import { addWildcardAllowFrom, normalizeAllowFromEntries } from "@enclawed/plugin-sdk/setup";
import type { MatrixConfig } from "./types.js";

type MatrixDmAllowFrom = NonNullable<MatrixConfig["dm"]>["allowFrom"];

export function resolveMatrixSetupDmAllowFrom(
  policy: DmPolicy,
  allowFrom: MatrixDmAllowFrom,
): string[] {
  if (policy === "open") {
    return addWildcardAllowFrom(allowFrom);
  }
  return normalizeAllowFromEntries(allowFrom ?? []).filter((entry) => entry !== "*");
}
