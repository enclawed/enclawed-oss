import type { EnclawedConfig } from "./types.enclawed.js";
export type GatewayNonLoopbackBindMode = "lan" | "tailnet" | "custom" | "auto";
export declare function isGatewayNonLoopbackBindMode(bind: unknown): bind is GatewayNonLoopbackBindMode;
export declare function hasConfiguredControlUiAllowedOrigins(params: {
    allowedOrigins: unknown;
    dangerouslyAllowHostHeaderOriginFallback: unknown;
}): boolean;
export declare function resolveGatewayPortWithDefault(port: unknown, fallback?: number): number;
export declare function buildDefaultControlUiAllowedOrigins(params: {
    port: number;
    bind: unknown;
    customBindHost?: string;
}): string[];
export declare function ensureControlUiAllowedOriginsForNonLoopbackBind(config: EnclawedConfig, opts?: {
    defaultPort?: number;
    requireControlUiEnabled?: boolean;
    /** Optional container-detection callback.  When provided and `gateway.bind`
     *  is unset, the function is called to determine whether the runtime will
     *  default to `"auto"` (container) so that origins can be seeded
     *  proactively.  Keeping this as an injected callback avoids a hard
     *  dependency from the config layer on the gateway runtime layer. */
    isContainerEnvironment?: () => boolean;
}): {
    config: EnclawedConfig;
    seededOrigins: string[] | null;
    bind: GatewayNonLoopbackBindMode | null;
};
