export type AuditRecord = {
    ts: number;
    type: string;
    actor: string;
    level: string | null;
    payload: unknown;
    prevHash: string;
    recordHash: string;
};
export declare function buildRecord(input: {
    prevHash: string;
    type: string;
    actor: string;
    level: string | null;
    payload: unknown;
    ts?: number;
}): AuditRecord;
export declare class AuditLogger {
    private readonly opts;
    private _lastHash;
    private _fh;
    private _writeQueue;
    private readonly clock;
    constructor(opts: {
        filePath: string;
        clock?: () => number;
    });
    private _ensureOpen;
    private _scanLastHash;
    append(input: {
        type: string;
        actor: string;
        level: string | null;
        payload: unknown;
    }): Promise<AuditRecord>;
    close(): Promise<void>;
}
export type ChainVerifyResult = {
    ok: true;
    count: number;
} | {
    ok: false;
    count: number;
    brokenAt: number;
    reason: string;
};
export declare function verifyChain(filePath: string): Promise<ChainVerifyResult>;
