import type { LegacyConfigRule } from "../../config/legacy.shared.js";
import type { EnclawedConfig } from "../../config/types.js";
type BundledChannelDoctorCompatibilityMutation = {
    config: EnclawedConfig;
    changes: string[];
};
type BundledChannelDoctorContractApi = {
    legacyConfigRules?: readonly LegacyConfigRule[];
    normalizeCompatibilityConfig?: (params: {
        cfg: EnclawedConfig;
    }) => BundledChannelDoctorCompatibilityMutation;
};
export declare function loadBundledChannelDoctorContractApi(channelId: string): BundledChannelDoctorContractApi | undefined;
export {};
