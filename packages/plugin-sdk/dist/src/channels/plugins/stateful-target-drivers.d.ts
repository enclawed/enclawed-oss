import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { ConfiguredBindingResolution, StatefulBindingTargetDescriptor } from "./binding-types.js";
export type StatefulBindingTargetReadyResult = {
    ok: true;
} | {
    ok: false;
    error: string;
};
export type StatefulBindingTargetSessionResult = {
    ok: true;
    sessionKey: string;
} | {
    ok: false;
    sessionKey: string;
    error: string;
};
export type StatefulBindingTargetResetResult = {
    ok: true;
} | {
    ok: false;
    skipped?: boolean;
    error?: string;
};
export type StatefulBindingTargetDriver = {
    id: string;
    ensureReady: (params: {
        cfg: EnclawedConfig;
        bindingResolution: ConfiguredBindingResolution;
    }) => Promise<StatefulBindingTargetReadyResult>;
    ensureSession: (params: {
        cfg: EnclawedConfig;
        bindingResolution: ConfiguredBindingResolution;
    }) => Promise<StatefulBindingTargetSessionResult>;
    resolveTargetBySessionKey?: (params: {
        cfg: EnclawedConfig;
        sessionKey: string;
    }) => StatefulBindingTargetDescriptor | null;
    resetInPlace?: (params: {
        cfg: EnclawedConfig;
        sessionKey: string;
        bindingTarget: StatefulBindingTargetDescriptor;
        reason: "new" | "reset";
        commandSource?: string;
    }) => Promise<StatefulBindingTargetResetResult>;
};
export declare function registerStatefulBindingTargetDriver(driver: StatefulBindingTargetDriver): void;
export declare function unregisterStatefulBindingTargetDriver(id: string): void;
export declare function getStatefulBindingTargetDriver(id: string): StatefulBindingTargetDriver | null;
export declare function resolveStatefulBindingTargetBySessionKey(params: {
    cfg: EnclawedConfig;
    sessionKey: string;
}): {
    driver: StatefulBindingTargetDriver;
    bindingTarget: StatefulBindingTargetDescriptor;
} | null;
