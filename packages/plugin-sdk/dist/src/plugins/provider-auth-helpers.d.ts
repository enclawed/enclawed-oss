import type { OAuthCredentials } from "@mariozechner/pi-ai";
import type { EnclawedConfig } from "../config/types.enclawed.js";
import { type SecretInput, type SecretRef } from "../config/types.secrets.js";
import type { SecretInputMode } from "./provider-auth-types.js";
export type ApiKeyStorageOptions = {
    secretInputMode?: SecretInputMode;
    config?: EnclawedConfig;
};
export type WriteOAuthCredentialsOptions = {
    syncSiblingAgents?: boolean;
    profileName?: string;
    displayName?: string;
};
export declare function buildApiKeyCredential(provider: string, input: SecretInput, metadata?: Record<string, string>, options?: ApiKeyStorageOptions): {
    type: "api_key";
    provider: string;
    key?: string;
    keyRef?: SecretRef;
    metadata?: Record<string, string>;
};
export declare function upsertApiKeyProfile(params: {
    provider: string;
    input: SecretInput;
    agentDir?: string;
    options?: ApiKeyStorageOptions;
    profileId?: string;
    metadata?: Record<string, string>;
}): string;
export declare function applyAuthProfileConfig(cfg: EnclawedConfig, params: {
    profileId: string;
    provider: string;
    mode: "api_key" | "oauth" | "token";
    email?: string;
    displayName?: string;
    preferProfileFirst?: boolean;
}): EnclawedConfig;
export declare function writeOAuthCredentials(provider: string, creds: OAuthCredentials, agentDir?: string, options?: WriteOAuthCredentialsOptions): Promise<string>;
