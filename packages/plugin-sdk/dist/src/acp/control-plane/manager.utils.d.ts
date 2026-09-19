import type { SessionAcpMeta } from "../../config/sessions/types.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
import { AcpRuntimeError } from "../runtime/errors.js";
import type { AcpSessionResolution } from "./manager.types.js";
export declare function resolveAcpAgentFromSessionKey(sessionKey: string, fallback?: string): string;
export declare function resolveMissingMetaError(sessionKey: string): AcpRuntimeError;
export declare function resolveAcpSessionResolutionError(resolution: AcpSessionResolution): AcpRuntimeError | null;
export declare function requireReadySessionMeta(resolution: AcpSessionResolution): SessionAcpMeta;
export declare function normalizeSessionKey(sessionKey: string): string;
export declare function canonicalizeAcpSessionKey(params: {
    cfg: EnclawedConfig;
    sessionKey: string;
}): string;
export declare function normalizeActorKey(sessionKey: string): string;
export declare function normalizeAcpErrorCode(code: string | undefined): AcpRuntimeError["code"];
export declare function createUnsupportedControlError(params: {
    backend: string;
    control: string;
}): AcpRuntimeError;
export declare function resolveRuntimeIdleTtlMs(cfg: EnclawedConfig): number;
export declare function hasLegacyAcpIdentityProjection(meta: SessionAcpMeta): boolean;
