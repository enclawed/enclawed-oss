import type { EnclawedConfig } from "../../config/types.js";
export type DirectoryConfigParams = {
    cfg: EnclawedConfig;
    accountId?: string | null;
    query?: string | null;
    limit?: number | null;
};
