export type Flavor = "open" | "enclaved";
export declare function parseFlavor(raw: string | undefined | null): Flavor | null;
export declare function getFlavor(env?: NodeJS.ProcessEnv): Flavor;
export declare function isEnclaved(env?: NodeJS.ProcessEnv): boolean;
