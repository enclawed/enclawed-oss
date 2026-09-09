import { type SessionAcpMeta, type SessionEntry } from "../../config/sessions/types.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
export type AcpSessionStoreEntry = {
    cfg: EnclawedConfig;
    storePath: string;
    sessionKey: string;
    storeSessionKey: string;
    entry?: SessionEntry;
    acp?: SessionAcpMeta;
    storeReadFailed?: boolean;
};
export declare function resolveSessionStorePathForAcp(params: {
    sessionKey: string;
    cfg?: EnclawedConfig;
}): {
    cfg: EnclawedConfig;
    storePath: string;
};
export declare function readAcpSessionEntry(params: {
    sessionKey: string;
    cfg?: EnclawedConfig;
}): AcpSessionStoreEntry | null;
export declare function listAcpSessionEntries(params: {
    cfg?: EnclawedConfig;
    env?: NodeJS.ProcessEnv;
}): Promise<AcpSessionStoreEntry[]>;
export declare function upsertAcpSessionMeta(params: {
    sessionKey: string;
    cfg?: EnclawedConfig;
    mutate: (current: SessionAcpMeta | undefined, entry: SessionEntry | undefined) => SessionAcpMeta | null | undefined;
}): Promise<SessionEntry | null>;
