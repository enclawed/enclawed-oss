import type { ConfigWriteOptions } from "./io.types.js";
import type { ConfigFileSnapshot, EnclawedConfig } from "./types.js";
export type ConfigMutationBase = "runtime" | "source";
export type ConfigReplaceResult = {
    path: string;
    previousHash: string | null;
    snapshot: ConfigFileSnapshot;
    nextConfig: EnclawedConfig;
};
export type ConfigReplaceAfterWritePolicy = {
    /**
     * Post-write activation policy. `"auto"` lets the host pick a deterministic
     * default (publish the new snapshot to live runtime callers); the legacy
     * `"none"` value keeps the new config staged without publishing.
     */
    mode: "auto" | "none";
    /** Optional human-readable reason recorded with the post-write action. */
    reason?: string;
};
export type ReplaceConfigFileParams = {
    nextConfig: EnclawedConfig;
    baseHash?: string;
    snapshot?: ConfigFileSnapshot;
    writeOptions?: ConfigWriteOptions;
    /**
     * Optional post-write activation policy forwarded from plugin mutation
     * callers. Accepted for compatibility with bundled channel/plugin code; the
     * default behavior matches `"auto"`.
     */
    afterWrite?: ConfigReplaceAfterWritePolicy;
};
export type MutateConfigFileParams<T = void> = {
    base?: ConfigMutationBase;
    baseHash?: string;
    writeOptions?: ConfigWriteOptions;
    /**
     * Optional post-write activation policy forwarded from plugin mutation
     * callers. Accepted for compatibility with bundled channel/plugin code; the
     * default behavior matches `"auto"`.
     */
    afterWrite?: ConfigReplaceAfterWritePolicy;
    mutate: (draft: EnclawedConfig, context: {
        snapshot: ConfigFileSnapshot;
        previousHash: string | null;
    }) => Promise<T | void> | T | void;
};
export type MutateConfigFileResult<T = void> = ConfigReplaceResult & {
    result: T | undefined;
};
export type ReplaceConfigFileFn = (params: ReplaceConfigFileParams) => Promise<ConfigReplaceResult>;
export type MutateConfigFileFn = <T = void>(params: MutateConfigFileParams<T>) => Promise<MutateConfigFileResult<T>>;
