import type { EnclawedConfig } from "../config/types.enclawed.js";
import { type ConfiguredAcpBindingSpec, type ResolvedConfiguredAcpBinding } from "./persistent-bindings.types.js";
export declare function ensureConfiguredAcpBindingSession(params: {
    cfg: EnclawedConfig;
    spec: ConfiguredAcpBindingSpec;
}): Promise<{
    ok: true;
    sessionKey: string;
} | {
    ok: false;
    sessionKey: string;
    error: string;
}>;
export declare function ensureConfiguredAcpBindingReady(params: {
    cfg: EnclawedConfig;
    configuredBinding: ResolvedConfiguredAcpBinding | null;
}): Promise<{
    ok: true;
} | {
    ok: false;
    error: string;
}>;
export declare function resetAcpSessionInPlace(params: {
    cfg: EnclawedConfig;
    sessionKey: string;
    reason: "new" | "reset";
    clearMeta?: boolean;
}): Promise<{
    ok: true;
} | {
    ok: false;
    skipped?: boolean;
    error?: string;
}>;
