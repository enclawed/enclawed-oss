type CompatMutationResult = {
    entry: Record<string, unknown>;
    changed: boolean;
};
export declare function asObjectRecord(value: unknown): Record<string, unknown> | null;
export declare function hasLegacyAccountStreamingAliases(value: unknown, match: (entry: unknown) => boolean): boolean;
export declare function normalizeLegacyDmAliases(params: {
    entry: Record<string, unknown>;
    pathPrefix: string;
    changes: string[];
    promoteAllowFrom?: boolean;
}): CompatMutationResult;
export declare function normalizeLegacyStreamingAliases(params: {
    entry: Record<string, unknown>;
    pathPrefix: string;
    changes: string[];
    resolvedMode: string;
    includePreviewChunk?: boolean;
    resolvedNativeTransport?: unknown;
    offModeLegacyNotice?: (pathPrefix: string) => string;
}): CompatMutationResult;
export type NormalizeLegacyChannelAliasesStreamingOptions = {
    resolvedMode: string;
    includePreviewChunk?: boolean;
    resolvedNativeTransport?: unknown;
    offModeLegacyNotice?: (pathPrefix: string) => string;
};
export type NormalizeLegacyChannelAliasesAccountExtraParams = {
    account: Record<string, unknown>;
    pathPrefix: string;
};
export type NormalizeLegacyChannelAliasesAccountExtraResult = {
    entry: Record<string, unknown>;
    changed: boolean;
};
export type NormalizeLegacyChannelAliasesParams = {
    entry: Record<string, unknown>;
    pathPrefix: string;
    changes: string[];
    normalizeDm?: boolean;
    normalizeAccountDm?: boolean;
    promoteAllowFrom?: boolean;
    resolveStreamingOptions?: (entry: Record<string, unknown>) => NormalizeLegacyChannelAliasesStreamingOptions;
    normalizeAccountExtra?: (params: NormalizeLegacyChannelAliasesAccountExtraParams) => NormalizeLegacyChannelAliasesAccountExtraResult;
};
/**
 * Compose the legacy-alias migration steps that channel doctor flows run as a
 * single unit: top-level dm-alias promotion, streaming-key promotion, and the
 * same passes for per-account configs. Lets channel plugins describe their
 * migration intent declaratively instead of stitching the pieces together.
 */
export declare function normalizeLegacyChannelAliases(params: NormalizeLegacyChannelAliasesParams): CompatMutationResult;
export declare function hasLegacyStreamingAliases(value: unknown, options?: {
    includePreviewChunk?: boolean;
    includeNativeTransport?: boolean;
}): boolean;
export {};
