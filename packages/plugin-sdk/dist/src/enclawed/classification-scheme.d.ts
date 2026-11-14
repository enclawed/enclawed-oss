export type SchemeLevel = Readonly<{
    rank: number;
    canonicalName: string;
    aliases: ReadonlyArray<string>;
}>;
export type ClassificationScheme = Readonly<{
    id: string;
    description: string;
    levels: ReadonlyArray<SchemeLevel>;
    validCompartments?: ReadonlyArray<string>;
    validReleasability?: ReadonlyArray<string>;
}>;
export declare const DEFAULT_SCHEME: ClassificationScheme;
export declare const US_GOVERNMENT_SCHEME: ClassificationScheme;
export declare const HEALTHCARE_HIPAA_SCHEME: ClassificationScheme;
export declare const FINANCIAL_SERVICES_SCHEME: ClassificationScheme;
export declare const GENERIC_3_TIER_SCHEME: ClassificationScheme;
export declare const BUILT_IN_SCHEMES: Readonly<Record<string, ClassificationScheme>>;
export declare function parseClassificationScheme(raw: unknown): ClassificationScheme;
export declare function getActiveScheme(): ClassificationScheme;
export declare function setActiveScheme(scheme: ClassificationScheme): void;
export declare function resetActiveScheme(): void;
export declare function levelByRank(rank: number, scheme?: ClassificationScheme): SchemeLevel | undefined;
export declare function clearanceNameToRank(name: string, scheme?: ClassificationScheme): number | undefined;
export declare function maxRank(scheme?: ClassificationScheme): number;
export declare function loadSchemeByName(name: string, opts?: {
    allowedDirs?: string[];
}): Promise<ClassificationScheme>;
