export declare function normalizeStringList(input: unknown): string[];
export declare function getFrontmatterString(frontmatter: Record<string, unknown>, key: string): string | undefined;
export declare function parseFrontmatterBool(value: string | undefined, fallback: boolean): boolean;
export declare function resolveEnclawedManifestBlock(params: {
    frontmatter: Record<string, unknown>;
    key?: string;
}): Record<string, unknown> | undefined;
export type EnclawedManifestRequires = {
    bins: string[];
    anyBins: string[];
    env: string[];
    config: string[];
};
export declare function resolveEnclawedManifestRequires(metadataObj: Record<string, unknown>): EnclawedManifestRequires | undefined;
export declare function resolveEnclawedManifestInstall<T>(metadataObj: Record<string, unknown>, parseInstallSpec: (input: unknown) => T | undefined): T[];
export declare function resolveEnclawedManifestOs(metadataObj: Record<string, unknown>): string[];
export type ParsedEnclawedManifestInstallBase = {
    raw: Record<string, unknown>;
    kind: string;
    id?: string;
    label?: string;
    bins?: string[];
};
export declare function parseEnclawedManifestInstallBase(input: unknown, allowedKinds: readonly string[]): ParsedEnclawedManifestInstallBase | undefined;
export declare function applyEnclawedManifestInstallCommonFields<T extends {
    id?: string;
    label?: string;
    bins?: string[];
}>(spec: T, parsed: Pick<ParsedEnclawedManifestInstallBase, "id" | "label" | "bins">): T;
