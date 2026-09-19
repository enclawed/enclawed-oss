import type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";
import { inspectDiscordAccount } from "./src/account-inspect.js";

export function inspectDiscordReadOnlyAccount(cfg: EnclawedConfig, accountId?: string | null) {
  return inspectDiscordAccount({ cfg, accountId });
}
