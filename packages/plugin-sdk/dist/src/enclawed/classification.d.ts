export declare const TIER: Readonly<{
    readonly PUBLIC: 0;
    readonly INTERNAL: 1;
    readonly CONFIDENTIAL: 2;
    readonly RESTRICTED: 3;
    readonly RESTRICTED_PLUS: 4;
    readonly SCI: 5;
}>;
export declare const LEVEL: Readonly<{
    readonly UNCLASSIFIED: 0;
    readonly CUI: 1;
    readonly CONFIDENTIAL: 2;
    readonly SECRET: 3;
    readonly TOP_SECRET: 4;
    readonly TOP_SECRET_SCI: 5;
}>;
export type Level = (typeof TIER)[keyof typeof TIER];
export type Label = Readonly<{
    level: Level;
    compartments: ReadonlyArray<string>;
    releasability: ReadonlyArray<string>;
}>;
export declare const HIGHEST_TIER_TEMPLATE: Label;
export declare const DOE_Q_TEMPLATE: Label;
export declare const DOE_L_TEMPLATE: Label;
export declare const PUBLIC: Label;
export declare const UNCLASSIFIED: Label;
export declare function makeLabel(input: {
    level: Level | number;
    compartments?: Iterable<string>;
    releasability?: Iterable<string>;
}): Label;
export declare function dominates(a: Label, b: Label): boolean;
export declare function combine(a: Label, b: Label): Label;
export type NameStyle = "generic" | "us-gov" | "active-scheme";
export declare function format(label: Label, opts?: {
    nameStyle?: NameStyle;
}): string;
export declare function parse(input: string): Label;
export declare function canRead(subject: Label, object: Label): boolean;
export declare function canWrite(subject: Label, object: Label): boolean;
