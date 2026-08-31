import type { EnclawedConfig } from "../config/types.enclawed.js";
import { type ExplicitGatewayAuth } from "./credentials.js";
export declare function hasExplicitGatewayConnectionAuth(auth?: ExplicitGatewayAuth): boolean;
export declare function canSkipGatewayConfigLoad(params: {
    config?: EnclawedConfig;
    urlOverride?: string;
    explicitAuth?: ExplicitGatewayAuth;
}): boolean;
export declare function isGatewayConfigBypassCommandPath(commandPath: readonly string[]): boolean;
