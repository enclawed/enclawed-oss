import type { EnclawedConfig } from "../config/types.enclawed.js";
export { shouldRequireGatewayTokenForInstall } from "../gateway/auth-install-policy.js";
export declare function resolveGatewayAuthTokenForService(cfg: EnclawedConfig, env: NodeJS.ProcessEnv): Promise<{
    token?: string;
    unavailableReason?: string;
}>;
