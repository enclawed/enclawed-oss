export type EnclawedVersion = {
    major: number;
    minor: number;
    patch: number;
    revision: number | null;
    prerelease: string[] | null;
};
export declare function parseEnclawedVersion(raw: string | null | undefined): EnclawedVersion | null;
export declare function normalizeEnclawedVersionBase(raw: string | null | undefined): string | null;
export declare function isSameEnclawedStableFamily(a: string | null | undefined, b: string | null | undefined): boolean;
export declare function compareEnclawedVersions(a: string | null | undefined, b: string | null | undefined): number | null;
export declare function shouldWarnOnTouchedVersion(current: string | null | undefined, touched: string | null | undefined): boolean;
