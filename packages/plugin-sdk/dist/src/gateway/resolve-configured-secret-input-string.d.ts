import type { EnclawedConfig } from "../config/types.enclawed.js";
export type SecretInputUnresolvedReasonStyle = "generic" | "detailed";
export type ConfiguredSecretInputSource = "config" | "secretRef" | "fallback";
export declare function resolveConfiguredSecretInputString(params: {
    config: EnclawedConfig;
    env: NodeJS.ProcessEnv;
    value: unknown;
    path: string;
    unresolvedReasonStyle?: SecretInputUnresolvedReasonStyle;
}): Promise<{
    value?: string;
    unresolvedRefReason?: string;
}>;
export declare function resolveConfiguredSecretInputWithFallback(params: {
    config: EnclawedConfig;
    env: NodeJS.ProcessEnv;
    value: unknown;
    path: string;
    unresolvedReasonStyle?: SecretInputUnresolvedReasonStyle;
    readFallback?: () => string | undefined;
}): Promise<{
    value?: string;
    source?: ConfiguredSecretInputSource;
    unresolvedRefReason?: string;
    secretRefConfigured: boolean;
}>;
export declare function resolveRequiredConfiguredSecretRefInputString(params: {
    config: EnclawedConfig;
    env: NodeJS.ProcessEnv;
    value: unknown;
    path: string;
    unresolvedReasonStyle?: SecretInputUnresolvedReasonStyle;
}): Promise<string | undefined>;
