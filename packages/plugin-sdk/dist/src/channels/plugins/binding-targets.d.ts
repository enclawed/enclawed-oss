import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { ConfiguredBindingResolution } from "./binding-types.js";
export declare function ensureConfiguredBindingTargetReady(params: {
    cfg: EnclawedConfig;
    bindingResolution: ConfiguredBindingResolution | null;
}): Promise<{
    ok: true;
} | {
    ok: false;
    error: string;
}>;
export declare function resetConfiguredBindingTargetInPlace(params: {
    cfg: EnclawedConfig;
    sessionKey: string;
    reason: "new" | "reset";
    commandSource?: string;
}): Promise<{
    ok: true;
} | {
    ok: false;
    skipped?: boolean;
    error?: string;
}>;
export declare function ensureConfiguredBindingTargetSession(params: {
    cfg: EnclawedConfig;
    bindingResolution: ConfiguredBindingResolution;
}): Promise<{
    ok: true;
    sessionKey: string;
} | {
    ok: false;
    sessionKey: string;
    error: string;
}>;
