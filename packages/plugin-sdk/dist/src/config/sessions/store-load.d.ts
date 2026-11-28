import { type SessionEntry } from "./types.js";
export type LoadSessionStoreOptions = {
    skipCache?: boolean;
};
export declare function normalizeSessionStore(store: Record<string, SessionEntry>): void;
export declare function loadSessionStore(storePath: string, opts?: LoadSessionStoreOptions): Record<string, SessionEntry>;
