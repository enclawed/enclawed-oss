import type { EnclawedConfig } from "../config/types.enclawed.js";
export declare function getScopedChannelsCommandSecretTargets(params: {
    config: EnclawedConfig;
    channel?: string | null;
    accountId?: string | null;
}): {
    targetIds: Set<string>;
    allowedPaths?: Set<string>;
};
export declare function getQrRemoteCommandSecretTargetIds(): Set<string>;
export declare function getChannelsCommandSecretTargetIds(): Set<string>;
export declare function getModelsCommandSecretTargetIds(): Set<string>;
export declare function getAgentRuntimeCommandSecretTargetIds(params?: {
    includeChannelTargets?: boolean;
}): Set<string>;
export declare function getStatusCommandSecretTargetIds(): Set<string>;
export declare function getSecurityAuditCommandSecretTargetIds(): Set<string>;
