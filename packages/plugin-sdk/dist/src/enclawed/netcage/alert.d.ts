import { type Finding } from "../dlp-scanner.js";
import type { NetCageAttempt, NetCageEvent } from "./cage.js";
export type NetCageSource = "exec" | "model-server";
export type NetCageAlert = {
    source: NetCageSource;
    /** What was running: the command line, or the model server's name. */
    label: string;
    attempt: NetCageAttempt;
    /** DLP findings in the bytes it tried to send (ids only, never the match). */
    findings: string[];
    /** Attempts to this destination so far, this one included. */
    count: number;
    message: string;
};
export type NetCageReporter = {
    onEvent: (event: NetCageEvent) => void;
    /** Attempts seen so far. */
    attempts: () => number;
    /** One line per destination, with its count, for a final summary. */
    summary: () => string[];
};
export declare function dlpFindingsOf(sampleBase64: string): Finding[];
export declare function createNetCageReporter(opts: {
    source: NetCageSource;
    label: string;
    /** Called at once for the first attempt to each destination. */
    notify: (alert: NetCageAlert) => void;
}): NetCageReporter;
