import { DEFAULT_ACCOUNT_ID } from "@enclawed/plugin-sdk/account-id";
import type { CoreConfig, ResolvedQaChannelAccount } from "./types.js";
declare const listQaChannelAccountIds: (cfg: import("@enclawed/plugin-sdk/account-resolution").EnclawedConfig) => string[], resolveDefaultQaChannelAccountId: (cfg: import("@enclawed/plugin-sdk/account-resolution").EnclawedConfig) => string;
export { listQaChannelAccountIds, resolveDefaultQaChannelAccountId };
export declare function resolveQaChannelAccount(params: {
    cfg: CoreConfig;
    accountId?: string | null;
}): ResolvedQaChannelAccount;
export declare function listEnabledQaChannelAccounts(cfg: CoreConfig): ResolvedQaChannelAccount[];
export { DEFAULT_ACCOUNT_ID };
export type { ResolvedQaChannelAccount } from "./types.js";
