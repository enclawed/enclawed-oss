import type { EnclawedConfig } from "../config/types.enclawed.js";
export declare function ensureRuntimePluginsLoaded(params: {
    config?: EnclawedConfig;
    workspaceDir?: string | null;
    allowGatewaySubagentBinding?: boolean;
}): void;
