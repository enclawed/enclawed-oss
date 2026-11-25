export type Flavor = "open" | "enclaved";
export declare function parseFlavor(raw: string | undefined | null): Flavor | null;
export type FlavorResolution = {
    flavor: Flavor;
    source: "env" | "admin-policy" | "default";
    /** ENCLAWED_FLAVOR value refused because it would loosen the admin flavor, else null. */
    refusedEnvValue: string | null;
};
export declare function resolveFlavor(env?: NodeJS.ProcessEnv, opts?: {
    adminFlavor?: Flavor | null;
}): FlavorResolution;
export declare function getFlavor(env?: NodeJS.ProcessEnv, opts?: {
    adminFlavor?: Flavor | null;
}): Flavor;
export declare function isEnclaved(env?: NodeJS.ProcessEnv): boolean;
