import type { Agent } from "node:http";
export declare const ENCLAWED_DEBUG_PROXY_ENABLED = "ENCLAWED_DEBUG_PROXY_ENABLED";
export declare const ENCLAWED_DEBUG_PROXY_URL = "ENCLAWED_DEBUG_PROXY_URL";
export declare const ENCLAWED_DEBUG_PROXY_DB_PATH = "ENCLAWED_DEBUG_PROXY_DB_PATH";
export declare const ENCLAWED_DEBUG_PROXY_BLOB_DIR = "ENCLAWED_DEBUG_PROXY_BLOB_DIR";
export declare const ENCLAWED_DEBUG_PROXY_CERT_DIR = "ENCLAWED_DEBUG_PROXY_CERT_DIR";
export declare const ENCLAWED_DEBUG_PROXY_SESSION_ID = "ENCLAWED_DEBUG_PROXY_SESSION_ID";
export declare const ENCLAWED_DEBUG_PROXY_REQUIRE = "ENCLAWED_DEBUG_PROXY_REQUIRE";
export type DebugProxySettings = {
    enabled: boolean;
    required: boolean;
    proxyUrl?: string;
    dbPath: string;
    blobDir: string;
    certDir: string;
    sessionId: string;
    sourceProcess: string;
};
export declare function resolveDebugProxySettings(env?: NodeJS.ProcessEnv): DebugProxySettings;
export declare function applyDebugProxyEnv(env: NodeJS.ProcessEnv, params: {
    proxyUrl: string;
    sessionId: string;
    dbPath?: string;
    blobDir?: string;
    certDir?: string;
}): NodeJS.ProcessEnv;
export declare function createDebugProxyWebSocketAgent(settings: DebugProxySettings): Agent | undefined;
export declare function resolveEffectiveDebugProxyUrl(configuredProxyUrl?: string): string | undefined;
