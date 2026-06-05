import type { EnclawedConfig } from "../../config/types.enclawed.js";
export declare function resolveProfileOverride(params: {
    rawProfile?: string;
    provider: string;
    cfg: EnclawedConfig;
    agentDir?: string;
}): {
    profileId?: string;
    error?: string;
};
