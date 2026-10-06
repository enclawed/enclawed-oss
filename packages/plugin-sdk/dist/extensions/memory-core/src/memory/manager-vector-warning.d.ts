export declare function logMemoryVectorDegradedWrite(params: {
    vectorEnabled: boolean;
    vectorReady: boolean;
    chunkCount: number;
    warningShown: boolean;
    loadError?: string;
    warn: (message: string) => void;
}): boolean;
