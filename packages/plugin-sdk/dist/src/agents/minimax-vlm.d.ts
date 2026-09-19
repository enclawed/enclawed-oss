export declare function isMinimaxVlmProvider(provider: string): boolean;
export declare function isMinimaxVlmModel(provider: string, modelId: string): boolean;
export declare function minimaxUnderstandImage(params: {
    apiKey: string;
    prompt: string;
    imageDataUrl: string;
    apiHost?: string;
    modelBaseUrl?: string;
    /**
     * Optional fetch timeout in milliseconds. When set, the underlying HTTP
     * request is aborted after this deadline. Treated as advisory by the
     * underlying client.
     */
    timeoutMs?: number;
}): Promise<string>;
