import type { EnclawedConfig } from "../config/types.enclawed.js";
export type SupportedGatewaySecretInputPath = "gateway.auth.token" | "gateway.auth.password" | "gateway.remote.token" | "gateway.remote.password";
export declare const ALL_GATEWAY_SECRET_INPUT_PATHS: SupportedGatewaySecretInputPath[];
export declare function isSupportedGatewaySecretInputPath(path: string): path is SupportedGatewaySecretInputPath;
export declare function readGatewaySecretInputValue(config: EnclawedConfig, path: SupportedGatewaySecretInputPath): unknown;
export declare function assignResolvedGatewaySecretInput(params: {
    config: EnclawedConfig;
    path: SupportedGatewaySecretInputPath;
    value: string | undefined;
}): void;
export declare function isTokenGatewaySecretInputPath(path: SupportedGatewaySecretInputPath): boolean;
