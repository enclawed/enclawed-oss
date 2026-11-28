import type { EnclawedConfig } from "../../config/types.enclawed.js";
export declare function resolveChannelMediaMaxBytes(params: {
    cfg: EnclawedConfig;
    resolveChannelLimitMb: (params: {
        cfg: EnclawedConfig;
        accountId: string;
    }) => number | undefined;
    accountId?: string | null;
}): number | undefined;
