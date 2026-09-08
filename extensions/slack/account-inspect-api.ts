import type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";
import { inspectSlackAccount } from "./src/account-inspect.js";

export function inspectSlackReadOnlyAccount(cfg: EnclawedConfig, accountId?: string | null) {
  return inspectSlackAccount({ cfg, accountId });
}
