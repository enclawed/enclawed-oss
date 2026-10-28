import type { EnclawedConfig } from "./runtime-api.js";
import { inspectTelegramAccount } from "./src/account-inspect.js";

export function inspectTelegramReadOnlyAccount(cfg: EnclawedConfig, accountId?: string | null) {
  return inspectTelegramAccount({ cfg, accountId });
}
