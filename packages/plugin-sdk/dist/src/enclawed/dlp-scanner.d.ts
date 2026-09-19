export type Severity = "low" | "medium" | "high" | "critical";
export type Finding = {
    id: string;
    severity: Severity;
    match: string;
    index: number;
};
export declare const SCAN_INPUT_MAX_BYTES: number;
export declare class DlpInputTooLargeError extends Error {
    readonly actual: number;
    readonly limit: number;
    name: string;
    constructor(actual: number, limit: number);
}
export type ScanOpts = {
    maxBytes?: number;
    onOversize?: "throw" | "truncate";
};
export declare function scan(text: string, opts?: ScanOpts): Finding[];
export declare function highestSeverity(findings: Finding[]): Severity | null;
export declare function redact(text: string, opts?: {
    placeholder?: string;
    minSeverity?: Severity;
}): string;
