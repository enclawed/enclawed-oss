export declare function loadRuntimeApiExportTypesViaJiti(params: {
    modulePath: string;
    exportNames: readonly string[];
    additionalAliases?: Record<string, string>;
    realPluginSdkSpecifiers?: readonly string[];
}): Record<string, string>;
