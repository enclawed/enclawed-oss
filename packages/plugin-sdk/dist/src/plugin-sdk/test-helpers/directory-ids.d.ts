import type { ChannelDirectoryEntry } from "../channel-contract.js";
import type { EnclawedConfig } from "../config-types.js";
export type DirectoryListFn = (params: {
    cfg: EnclawedConfig;
    accountId?: string;
    query?: string | null;
    limit?: number | null;
}) => Promise<ChannelDirectoryEntry[]>;
export declare function expectDirectoryIds(listFn: DirectoryListFn, cfg: EnclawedConfig, expected: string[], options?: {
    sorted?: boolean;
}): Promise<void>;
