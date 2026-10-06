import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { RuntimeEnv } from "../runtime.js";
export declare function resolveAgentRuntimeConfig(runtime: RuntimeEnv, params?: {
    runtimeTargetsChannelSecrets?: boolean;
}): Promise<{
    loadedRaw: EnclawedConfig;
    sourceConfig: EnclawedConfig;
    cfg: EnclawedConfig;
}>;
