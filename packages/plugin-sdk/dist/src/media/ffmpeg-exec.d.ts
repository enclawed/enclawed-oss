export type MediaExecOptions = {
    timeoutMs?: number;
    maxBufferBytes?: number;
    /**
     * Optional stdin payload forwarded to ffmpeg/ffprobe via `pipe:0`. Used by
     * in-memory probes that avoid round-tripping through a temporary file.
     */
    input?: Buffer | Uint8Array | string;
};
export declare function runFfprobe(args: string[], options?: MediaExecOptions): Promise<string>;
export declare function runFfmpeg(args: string[], options?: MediaExecOptions): Promise<string>;
export declare function parseFfprobeCsvFields(stdout: string, maxFields: number): string[];
export declare function parseFfprobeCodecAndSampleRate(stdout: string): {
    codec: string | null;
    sampleRateHz: number | null;
};
