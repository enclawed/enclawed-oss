import type { EnclawedConfig } from "../../config/config.js";
export declare function shouldApplyStartupContext(params: {
    cfg?: EnclawedConfig;
    action: "new" | "reset";
}): boolean;
export declare function buildSessionStartupContextPrelude(params: {
    workspaceDir: string;
    cfg?: EnclawedConfig;
    nowMs?: number;
}): Promise<string | null>;
