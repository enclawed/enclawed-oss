export type AdmissionDecision = Readonly<{
    admit: true;
    flavor: "open" | "enclaved";
    warnings: ReadonlyArray<string>;
} | {
    admit: false;
    flavor: "open" | "enclaved";
    reason: string;
}>;
export type AdmissionInput = {
    pluginId: string;
    /**
     * The candidate's root directory. When given, admission also checks that it
     * is the same directory, with the same manifests, that boot-time
     * verification vouched for under this id.
     */
    rootDir?: string;
};
export declare function admitPluginCandidate(input: AdmissionInput): AdmissionDecision;
