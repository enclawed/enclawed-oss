import type { ChannelDirectoryEntryKind, ChannelId } from "../../channels/plugins/types.public.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
export type DirectoryCacheKey = {
    channel: ChannelId;
    accountId?: string | null;
    kind: ChannelDirectoryEntryKind;
    source: "cache" | "live";
    signature?: string | null;
};
export declare function buildDirectoryCacheKey(key: DirectoryCacheKey): string;
export declare class DirectoryCache<T> {
    private readonly ttlMs;
    private readonly cache;
    private lastConfigRef;
    private readonly maxSize;
    constructor(ttlMs: number, maxSize?: number);
    get(key: string, cfg: EnclawedConfig): T | undefined;
    set(key: string, value: T, cfg: EnclawedConfig): void;
    clearMatching(match: (key: string) => boolean): void;
    clear(cfg?: EnclawedConfig): void;
    private resetIfConfigChanged;
    private pruneExpired;
    private evictToMaxSize;
}
