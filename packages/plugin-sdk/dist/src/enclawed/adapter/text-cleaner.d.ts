/**
 * Unicode Default_Ignorable_Code_Point (DerivedCoreProperties.txt), Unicode
 * 17.0, as inclusive [first, last] ranges, sorted. These render as nothing,
 * so a person reading the text cannot see them.
 */
export declare const DEFAULT_IGNORABLE_RANGES: ReadonlyArray<readonly [number, number]>;
/**
 * What the model sees in place of content the cleaner could not finish.
 * Neutral on purpose: it does not claim to come from Enclawed, whose notices
 * reach the model only out of band.
 */
export declare const WITHHELD_MARKER = "[content withheld: too complex to inspect]";
/** What neutralizeNotices puts before a notice-looking "Enclawed". */
export declare const NOTICE_QUOTE = "quoted-";
export declare const DEFAULT_BUDGET_MS = 1000;
export type CleanerFindingType = "unicode-tag" | "lone-surrogate" | "zero-width-run" | "variation-selector-run" | "bidi-control" | "ansi-conceal" | "ansi-cursor" | "ansi-c1" | "control-overwrite" | "spoofed-notice" | "hidden-html" | "too-complex" | "withheld-region";
export type CleanerFinding = Readonly<{
    type: CleanerFindingType;
    index: number;
    count: number;
    note?: string;
}>;
export type CleanTextResult = {
    clean: string;
    findings: CleanerFinding[];
    withheld?: true;
};
/** The technique families this cleaner is designed to catch. */
export declare const COVERED: readonly CleanerFindingType[];
type Tick = () => void;
/** Number of code points in a string (no intermediate array). */
export declare function codePointLength(s: string): number;
/** Does s hold anything renderUnits changes (ESC, CR, BS, VT, FF, or an 8-bit C1 introducer)? */
export declare function needsRender(s: string): boolean;
/**
 * The skeleton of `s`: what a reader sees, as lowercase Latin with look-alikes
 * folded, combining marks, invisibles and Markdown emphasis dropped, runs of
 * spaces collapsed. `map[i]` is the index in `s` skeleton character i came
 * from. Linear.
 */
export declare function skeleton(s: string, tick?: Tick): {
    skel: string;
    map: Int32Array;
};
/**
 * Text that imitates a notice from Enclawed, matched on the skeleton anywhere
 * in a line: "enclawed", optional space, an optional hex token of 4 or more
 * characters, optional space, then ":" (or "]" after a token). Each match gets
 * NOTICE_QUOTE before the word in the original text. A plain quoted or
 * inline-code "Enclawed:" (documentation of the format) is left alone. Linear.
 */
export declare function neutralizeNotices(s: string, tick?: Tick): {
    text: string;
    at: number;
    count: number;
};
/** The fail-safe result for a payload that is not inspected. */
export declare function withheldResult(text: unknown, note?: string): CleanTextResult;
/**
 * Clean one string. On budget exhaustion `clean` is WITHHELD_MARKER and the
 * single finding is "too-complex": the content is never passed through.
 */
export declare function cleanText(text: string, opts?: {
    budgetMs?: number;
    deadline?: number;
    maxRounds?: number;
}): CleanTextResult;
/** Strip invisible and bidi code points; returns the visible text and how many were removed. */
export declare function stripHidden(s: string): {
    text: string;
    removed: number;
};
export {};
