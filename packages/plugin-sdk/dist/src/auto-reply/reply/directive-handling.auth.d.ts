import type { EnclawedConfig } from "../../config/types.enclawed.js";
export type ModelAuthDetailMode = "compact" | "verbose";
export declare const resolveAuthLabel: (provider: string, cfg: EnclawedConfig, modelsPath: string, agentDir?: string, mode?: ModelAuthDetailMode) => Promise<{
    label: string;
    source: string;
}>;
export declare const formatAuthLabel: (auth: {
    label: string;
    source: string;
}) => string;
export { resolveProfileOverride } from "./directive-handling.auth-profile.js";
