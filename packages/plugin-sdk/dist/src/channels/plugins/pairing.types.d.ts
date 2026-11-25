import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { RuntimeEnv } from "../../runtime.js";
export type ChannelPairingAdapter = {
    idLabel: string;
    normalizeAllowEntry?: (entry: string) => string;
    notifyApproval?: (params: {
        cfg: EnclawedConfig;
        id: string;
        accountId?: string;
        runtime?: RuntimeEnv;
    }) => Promise<void>;
};
