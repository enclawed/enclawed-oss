import type { GatewayAuthConfig, GatewayTailscaleConfig, EnclawedConfig } from "../config/config.js";
import { resolveGatewayAuth, type ResolvedGatewayAuth } from "./auth.js";
export declare function mergeGatewayAuthConfig(base?: GatewayAuthConfig, override?: GatewayAuthConfig): GatewayAuthConfig;
export declare function mergeGatewayTailscaleConfig(base?: GatewayTailscaleConfig, override?: GatewayTailscaleConfig): GatewayTailscaleConfig;
export declare function ensureGatewayStartupAuth(params: {
    cfg: EnclawedConfig;
    env?: NodeJS.ProcessEnv;
    authOverride?: GatewayAuthConfig;
    tailscaleOverride?: GatewayTailscaleConfig;
    persist?: boolean;
    baseHash?: string;
}): Promise<{
    cfg: EnclawedConfig;
    auth: ReturnType<typeof resolveGatewayAuth>;
    generatedToken?: string;
    persistedGeneratedToken: boolean;
}>;
export declare function assertGatewayAuthNotKnownWeak(auth: ResolvedGatewayAuth): void;
export declare function assertHooksTokenSeparateFromGatewayAuth(params: {
    cfg: EnclawedConfig;
    auth: ResolvedGatewayAuth;
}): void;
