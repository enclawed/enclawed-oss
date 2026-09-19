import { type EnclawedConfig } from "../config/config.js";
export { resetModelsJsonReadyCacheForTest } from "./models-config-state.js";
export declare function ensureModelsFileModeForModelsJson(pathname: string): Promise<void>;
export declare function writeModelsFileAtomicForModelsJson(targetPath: string, contents: string): Promise<void>;
export declare function ensureEnclawedModelsJson(config?: EnclawedConfig, agentDirOverride?: string): Promise<{
    agentDir: string;
    wrote: boolean;
}>;
