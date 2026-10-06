/**
 * Result-classification shape used by the embedded-runner fallback path to
 * convert a terminal embedded-pi run into a `format`-class fallback reason.
 * Returning null defers the decision to the broader model-fallback policy.
 */
export type ModelFallbackResultClassification = {
    message: string;
    reason: "format";
    code: string;
} | null;
export declare function classifyEmbeddedPiRunResultForModelFallback(params: {
    provider: string;
    model: string;
    result: unknown;
    hasDirectlySentBlockReply?: boolean;
    hasBlockReplyPipelineOutput?: boolean;
}): ModelFallbackResultClassification;
