import type { EnclawedConfig } from "../config/types.enclawed.js";
import { type SecretInputUnresolvedReasonStyle } from "./resolve-configured-secret-input-string.js";
export type GatewayAuthTokenResolutionSource = "explicit" | "config" | "secretRef" | "env";
export type GatewayAuthTokenEnvFallback = "never" | "no-secret-ref" | "always";
export declare function resolveGatewayAuthToken(params: {
    cfg: EnclawedConfig;
    env: NodeJS.ProcessEnv;
    explicitToken?: string;
    envFallback?: GatewayAuthTokenEnvFallback;
    unresolvedReasonStyle?: SecretInputUnresolvedReasonStyle;
}): Promise<{
    token?: string;
    source?: GatewayAuthTokenResolutionSource;
    secretRefConfigured: boolean;
    unresolvedRefReason?: string;
}>;
