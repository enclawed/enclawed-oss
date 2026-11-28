/**
 * Validate and normalize one entry. `allowGlob` permits `*` (one segment)
 * and `**` (any depth) wildcards; other glob syntax is refused.
 */
export declare function validateOperatorPathEntry(raw: string, field: string, opts: {
    allowGlob: boolean;
    homedir?: string;
}): string;
/**
 * True when `target` (absolute, normalized) is an entry or lies under one.
 * A plain entry matches itself and everything below it; a glob matches the
 * path itself or any of its ancestors, so `/data/**` and `/data/*.bin`
 * behave as expected.
 */
export declare function pathMatchesEntry(target: string, entry: string): boolean;
export declare function isInsideDir(dir: string, target: string): boolean;
