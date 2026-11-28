import type { ConfigFileSnapshot } from "./types.js";
export type ConfigWriteOptions = {
    /**
     * Read-time env snapshot used to validate `${VAR}` restoration decisions.
     * If omitted, write falls back to current process env.
     */
    envSnapshotForRestore?: Record<string, string | undefined>;
    /**
     * Optional safety check: only use envSnapshotForRestore when writing the
     * same config file path that produced the snapshot.
     */
    expectedConfigPath?: string;
    /**
     * Paths that must be explicitly removed from the persisted file payload,
     * even if schema/default normalization reintroduces them.
     */
    unsetPaths?: string[][];
    /**
     * Internal fast path for callers that already hold a fresh config snapshot.
     * Avoids rereading the full config just to prepare an immediate write.
     */
    baseSnapshot?: ConfigFileSnapshot;
    /**
     * Internal one-shot CLI fast path. When no runtime snapshot is active, skip
     * the post-write runtime snapshot refresh/reload tail entirely.
     */
    skipRuntimeSnapshotRefresh?: boolean;
};
