export type AdmissionDecision = Readonly<{
    admit: true;
    flavor: "open" | "enclaved";
    warnings: ReadonlyArray<string>;
} | {
    admit: false;
    flavor: "open" | "enclaved";
    reason: string;
}>;
export declare function admitPluginCandidate(input: {
    pluginId: string;
}): AdmissionDecision;
